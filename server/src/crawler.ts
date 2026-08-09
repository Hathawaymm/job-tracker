import { batchFindExistingKeys, countNewSince, findDecidedByHash, getJobById, getTaskConfig, insertCrawlLog, insertJob, updateCrawlLog, updateJobJd, updateJobMatch, updateTask } from './db.js'
import type { JobRow } from './db.js'
import type { RawJob, SearchQuery } from './adapters/types.js'
import { hardFilter, parseExpectedMinK } from './filter.js'
import { aiMatchScore } from './matcher.js'
import { uniqueKey, urlHash } from './hash.js'
import { enqueueFetchJd, enqueueSearch, isExtensionOnline, setProgress } from './ext.js'
import { log } from './logger.js'

function addDays(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

/** 通过 Chrome 扩展抓取列表岗位（扩展离线时给出友好提示） */
async function searchJobs(query: SearchQuery, crawlLogId?: number): Promise<RawJob[]> {
  if (!isExtensionOnline()) {
    throw new Error('抓取扩展未在线：请先在 Chrome 安装并打开「AI 求职助手抓取」扩展（或刷新浏览器），再点「立即抓取」')
  }
  return enqueueSearch(query, 900000, crawlLogId)
}

/** 通过 Chrome 扩展抓取岗位详情 JD */
async function fetchJdExt(url: string): Promise<string> {
  if (!isExtensionOnline()) throw new Error('抓取扩展未在线')
  return enqueueFetchJd(url)
}

/** 从 JD 文本中启发式提取标题/公司（尽力而为，失败回退空串） */
function extractMeta(jd: string): { title: string; company: string } {
  const lines = jd.split('\n').map((l) => l.trim()).filter(Boolean)
  const first = lines[0] ?? ''
  let title = first.length > 120 ? first.slice(0, 120) : first
  const companyMatch = jd.match(/(?:公司|企业)[：:]\s*([^\n，。]{2,40})/)
  return { title, company: companyMatch?.[1] ?? '' }
}

/**
 * 手动新增：按 URL 抓取岗位详情并入库（绕过列表反爬，走扩展 fetchJd 通道）
 * 返回入库后的岗位行；抓取失败或内容为空时抛出错误
 */
export async function fetchJobByUrl(url: string, platform: string): Promise<JobRow> {
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) throw new Error('链接格式不正确，需以 http(s):// 开头')
  const jd = await fetchJdExt(trimmed)
  if (!jd.trim()) throw new Error('未能提取到岗位内容，可能需登录或已触发反爬，可尝试复制 JD 文本手动填写')

  const { title, company } = extractMeta(jd)
  const id = insertJob({
    platform: platform || 'manual',
    external_id: null,
    url_hash: urlHash(trimmed),
    url: trimmed,
    title: title || '手动添加岗位',
    company,
    salary: '',
    city: '',
    jd,
    fetched_at: new Date().toISOString(),
    is_new: 1,
    hard_ok: 0,
    match_score: null,
    match_reason: '',
    decision: 'pending',
    greeting: '',
    unique_key: uniqueKey(platform || 'manual', null, company, title, ''),
  })
  const job = getJobById(id)
  if (!job) throw new Error('岗位入库失败')
  return job
}

export interface RunResult {
  fetched: number
  inserted: number
  skippedDup: number
  scored: number
  newCount: number
  skipped: boolean
  error?: string
  durationMs: number
}

/** 完整抓取流水线：抓列表 → 入库去重 → 硬过滤 → AI评分 → ≥阈值补JD → 自适应跳过判断 */
export async function runCrawl(triggeredBy: 'manual' | 'scheduled', resumeTextOverride?: string): Promise<RunResult> {
  const config = getTaskConfig()
  if (!config.keyword.trim()) throw new Error('请先在设置中填写岗位名称')

  const resumeText = (resumeTextOverride ?? config.resumeText ?? '').trim()
  if (!resumeText) throw new Error('简历内容为空，请先在「简历」页保存简历')

  const startedAt = Date.now()
  const startedIso = new Date(startedAt).toISOString()
  // 技术日志：抓取开始
  const crawlLogId = insertCrawlLog(startedIso, triggeredBy, isExtensionOnline())
  log.info('crawl', `抓取开始 triggeredBy=${triggeredBy} platform=${config.platform} keyword=${config.keyword} count=${config.count}`)

  const fetchedAt = new Date().toISOString()

  // 需求5：进度 — 抓取阶段
  setProgress({ phase: 'crawling', platform: config.platform, total: config.count, fetched: 0, scored: 0, matched: 0 })

  let hardFilteredCount = 0
  let jdFetchedCount = 0
  let scored = 0
  let matchedCount = 0

  try {
    // 1) 列表页抓取（上限 config.count）
    const rawJobs = await searchJobs(
      {
        keyword: config.keyword,
        city: config.city,
        salary: config.salary,
        count: config.count,
        delayRange: config.delayRange,
        platform: config.platform,
        salaryUnit: config.salaryUnit,
      },
      crawlLogId,
    )
    setProgress({ fetched: rawJobs.length })

    // 2) 入库 + 去重
    let inserted = 0
    let skippedDup = 0
    let malformed = 0
    const pendingIds: number[] = []
    // 方案 B：批量集合比对——一次性查出本批已存在的 unique_key，差集只插入新岗位
    const batchKeys: string[] = []
    for (const raw of rawJobs) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
      batchKeys.push(uniqueKey(config.platform, raw.externalId, raw.company, raw.title, raw.city))
    }
    const existingSet = new Set(batchFindExistingKeys(batchKeys))
    for (const raw of rawJobs) {
      // 防御：扩展回传的数据形状异常（如嵌套数组）时跳过并留痕，避免整批失败
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        malformed++
        log.error('crawl', '畸形岗位条目，已跳过', { index: malformed - 1, type: typeof raw, isArray: Array.isArray(raw), keys: raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw) : [], title: raw && typeof raw === 'object' ? (raw as { title?: unknown }).title : null })
        continue
      }
      const uk = uniqueKey(config.platform, raw.externalId, raw.company, raw.title, raw.city)
      if (existingSet.has(uk)) {
        skippedDup++
        continue
      }
      const h = urlHash(raw.url || `${raw.title}${raw.company}`)
      const id = insertJob({
        platform: config.platform,
        external_id: raw.externalId ?? null,
        url_hash: h,
        url: raw.url,
        title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : '未命名岗位',
        company: raw.company,
        salary: raw.salary,
        city: raw.city,
        jd: raw.jd,
        fetched_at: fetchedAt,
        is_new: 1,
        hard_ok: 0,
        match_score: null,
        match_reason: '',
        decision: 'pending',
        greeting: '',
        unique_key: uk,
      })
      inserted++
      pendingIds.push(id)
    }
    if (malformed > 0) log.error('crawl', `本次共跳过 ${malformed} 条畸形条目`)

    // 3) 硬过滤 + AI 评分
    const expectedMinK = parseExpectedMinK(config.salary)
    setProgress({ phase: 'scoring', total: rawJobs.length })
    for (const id of pendingIds) {
      const job = getJobById(id)
      if (!job) continue
      const hf = hardFilter({ city: job.city, salary: job.salary }, config.city, expectedMinK)
      if (!hf.passed) {
        hardFilteredCount++
        continue
      }
      try {
        const outcome = await aiMatchScore(job.jd || `${job.title} ${job.company}`, resumeText, config.targetIndustries)
        updateJobMatch(id, outcome.score, outcome.reason)
        scored++
        if (outcome.score >= config.threshold) {
          matchedCount++
          setProgress({ scored, matched: matchedCount })
        } else {
          setProgress({ scored })
        }
        // 4) ≥阈值 的岗位按需补完整 JD
        if (outcome.score >= config.threshold && !job.jd.trim() && job.url) {
          try {
            const jd = await fetchJdExt(job.url)
            if (jd) {
              updateJobJd(id, jd)
              jdFetchedCount++
            }
          } catch (err) {
            log.error('crawl', '补 JD 失败:', err instanceof Error ? err.message : err)
          }
        }
      } catch (err) {
        log.error('crawl', '评分失败:', err instanceof Error ? err.message : err)
      }
    }

    // 5) 自适应跳过：新增 ≥阈值 少于 minNew 则跳过后续时段
    const newCount = countNewSince(config.threshold, fetchedAt)
    let skipped = false
    if (newCount < config.minNew) {
      skipped = true
      updateTask({ skip_until: addDays(1).toISOString().slice(0, 10) })
      log.info('crawl', `新增 ≥${config.threshold}% 岗位 ${newCount} 个 < ${config.minNew}，跳过后续时段，次日恢复`)
    }
    updateTask({ last_run_at: new Date().toISOString() })

    setProgress({ phase: 'done', scored, matched: matchedCount })

    // 技术日志：抓取完成
    updateCrawlLog(crawlLogId, {
      finished_at: new Date().toISOString(),
      status: 'done',
      fetched: rawJobs.length,
      inserted,
      skipped_dup: skippedDup,
      hard_filtered: hardFilteredCount,
      scored,
      matched: matchedCount,
      jd_fetched: jdFetchedCount,
      duration_ms: Date.now() - startedAt,
    })

    return {
      fetched: rawJobs.length,
      inserted,
      skippedDup,
      scored,
      newCount,
      skipped,
      durationMs: Date.now() - startedAt,
    }
  } catch (err) {
    // 技术日志：抓取出错
    updateCrawlLog(crawlLogId, {
      finished_at: new Date().toISOString(),
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - startedAt,
    })
    throw err
  }
}
