import { countNewSince, findDecidedByHash, getJobById, getTaskConfig, insertJob, updateJobJd, updateJobMatch, updateTask } from './db.js'
import type { RawJob, SearchQuery } from './adapters/types.js'
import { hardFilter, parseExpectedMinK } from './filter.js'
import { aiMatchScore } from './matcher.js'
import { urlHash } from './hash.js'
import { enqueueFetchJd, enqueueSearch, isExtensionOnline } from './ext.js'

function addDays(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

/** 通过 Chrome 扩展抓取列表岗位（扩展离线时给出友好提示） */
async function searchJobs(query: SearchQuery): Promise<RawJob[]> {
  if (!isExtensionOnline()) {
    throw new Error('抓取扩展未在线：请先在 Chrome 安装并打开「AI 求职助手抓取」扩展（或刷新浏览器），再点「立即抓取」')
  }
  return enqueueSearch(query)
}

/** 通过 Chrome 扩展抓取岗位详情 JD */
async function fetchJdExt(url: string): Promise<string> {
  if (!isExtensionOnline()) throw new Error('抓取扩展未在线')
  return enqueueFetchJd(url)
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
export async function runCrawl(resumeTextOverride?: string): Promise<RunResult> {
  const config = getTaskConfig()
  if (!config.keyword.trim()) throw new Error('请先在设置中填写岗位名称')

  const resumeText = (resumeTextOverride ?? config.resumeText ?? '').trim()
  if (!resumeText) throw new Error('简历内容为空，请先在「简历」页保存简历')

  const fetchedAt = new Date().toISOString()
  const startedAt = Date.now()

  // 1) 列表页抓取（上限 config.count）
  const rawJobs = await searchJobs({
    keyword: config.keyword,
    city: config.city,
    salary: config.salary,
    count: config.count,
    delayRange: config.delayRange,
  })

  // 2) 入库 + 去重
  let inserted = 0
  let skippedDup = 0
  const pendingIds: number[] = []
  for (const raw of rawJobs) {
    const h = urlHash(raw.url || `${raw.title}${raw.company}`)
    if (findDecidedByHash(h)) {
      skippedDup++
      continue
    }
    const id = insertJob({
      platform: config.platform,
      external_id: raw.externalId ?? null,
      url_hash: h,
      url: raw.url,
      title: raw.title,
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
    })
    inserted++
    pendingIds.push(id)
  }

  // 3) 硬过滤 + AI 评分
  const expectedMinK = parseExpectedMinK(config.salary)
  let scored = 0
  for (const id of pendingIds) {
    const job = getJobById(id)
    if (!job) continue
    const hf = hardFilter({ city: job.city, salary: job.salary }, config.city, expectedMinK)
    if (!hf.passed) continue
    try {
      const outcome = await aiMatchScore(job.jd || `${job.title} ${job.company}`, resumeText)
      updateJobMatch(id, outcome.score, outcome.reason)
      scored++
      // 4) ≥阈值 的岗位按需补完整 JD
      if (outcome.score >= config.threshold && !job.jd.trim() && job.url) {
        try {
          const jd = await fetchJdExt(job.url)
          if (jd) updateJobJd(id, jd)
        } catch (err) {
          console.log('[crawl] 补 JD 失败:', err instanceof Error ? err.message : err)
        }
      }
    } catch (err) {
      console.log('[crawl] 评分失败:', err instanceof Error ? err.message : err)
    }
  }

  // 5) 自适应跳过：新增 ≥阈值 少于 minNew 则跳过后续时段
  const newCount = countNewSince(config.threshold, fetchedAt)
  let skipped = false
  if (newCount < config.minNew) {
    skipped = true
    updateTask({ skip_until: addDays(1).toISOString().slice(0, 10) })
    console.log(`[crawl] 新增 ≥${config.threshold}% 岗位 ${newCount} 个 < ${config.minNew}，跳过后续时段，次日恢复`)
  }
  updateTask({ last_run_at: new Date().toISOString() })

  return {
    fetched: rawJobs.length,
    inserted,
    skippedDup,
    scored,
    newCount,
    skipped,
    durationMs: Date.now() - startedAt,
  }
}
