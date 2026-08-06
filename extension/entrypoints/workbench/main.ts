// AI 求职助手抓取工作台 - 常驻扩展页面（不受 MV3 Service Worker 30s 回收影响）
// 承担：轮询 server 领任务 → 后台开 BOSS tab 抓取（复用登录态）→ 结果回传

interface RawJob {
  externalId: string
  title: string
  salary: string
  company: string
  city: string
  url: string
  jd: string
}

interface SearchQuery {
  keyword: string
  city: string
  salary: string
  count: number
  delayRange: [number, number]
  platform?: 'boss' | 'liepin'
  salaryUnit?: 'month' | 'year'
}

const SERVER = 'http://127.0.0.1:3001'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function randomDelay([min, max]: [number, number]): number {
  return (min + Math.random() * (max - min)) * 1000
}

/** 保活：调用 Chrome API 重置空闲计时（后台标签页被冻结时也有帮助） */
async function keepAlive(): Promise<void> {
  try {
    await browser.runtime.getPlatformInfo()
  } catch {
    // 忽略
  }
}

const CITY_CODES: Record<string, string> = {
  北京: '101010100', 上海: '101020100', 广州: '101280100', 深圳: '101280600',
  杭州: '101210100', 成都: '101270100', 南京: '101190100', 武汉: '101200100',
  西安: '101110100', 苏州: '101190400', 天津: '101030100', 重庆: '101040100',
  长沙: '101250100', 郑州: '101180100', 青岛: '101120200', 厦门: '101230200',
  合肥: '101220100', 福州: '101230100', 济南: '101120100', 无锡: '101190200',
  东莞: '101281600', 佛山: '101280800', 宁波: '101210400', 大连: '101070200',
  沈阳: '101070100', 昆明: '101290100', 石家庄: '101090100', 南昌: '101240100',
  贵阳: '101260100', 南宁: '101300100', 太原: '101100100', 长春: '101060100',
  哈尔滨: '101050100', 珠海: '101280700', 中山: '101281700', 温州: '101210300',
  常州: '101191100', 南通: '101190500', 烟台: '101120500', 徐州: '101190800',
  金华: '101210900', 绍兴: '101210500', 台州: '101210600',
}

// 猎聘城市码（dq 参数），来自猎聘官方城市筛选，30 个主要城市
const LIE_CITY_CODES: Record<string, string> = {
  北京: '010', 上海: '020', 天津: '030', 重庆: '040',
  广州: '050020', 深圳: '050090', 苏州: '060080', 南京: '060020',
  杭州: '070020', 大连: '210040', 成都: '280020', 武汉: '170020', 西安: '270020',
}

// 猎聘年薪档位（salaryCode），1=10万以下 … 7=100万以上
const LIE_SALARY_CODES: Array<{ min: number; max: number; code: string }> = [
  { min: 0, max: 10, code: '1' },
  { min: 10, max: 15, code: '2' },
  { min: 15, max: 20, code: '3' },
  { min: 20, max: 30, code: '4' },
  { min: 30, max: 50, code: '5' },
  { min: 50, max: 100, code: '6' },
  { min: 100, max: Infinity, code: '7' },
]

/** 解析月薪 k（如 20k-30k / 25-40k）→ 年薪万（k×12÷10） */
function parseMonthlyK(value: string): { minWan: number; maxWan: number } | null {
  const clean = value.replace(/k|K|万|w|薪|元|月|年薪/gi, '')
  const parts = clean.split(/[-~至到]/).map((x) => x.trim()).filter((p): p is string => p.length > 0)
  const nums = parts.map(Number).filter((n) => Number.isFinite(n) && n > 0)
  if (nums.length === 0) return null
  const min = Math.min(...nums)
  const max = nums.length >= 2 ? Math.max(...nums) : min
  return { minWan: (min * 12) / 10, maxWan: (max * 12) / 10 }
}

/** 年薪万（如 20-30万 / 20-30）→ 年薪区间 */
function parseYearWan(value: string): { minWan: number; maxWan: number } | null {
  const clean = value.replace(/k|K|月/gi, '')
  const parts = clean.split(/[-~至到]/).map((x) => x.trim()).filter((p): p is string => p.length > 0)
  const nums = parts.map(Number).filter((n) => Number.isFinite(n) && n > 0)
  if (nums.length === 0) return null
  const min = Math.min(...nums)
  const max = nums.length >= 2 ? Math.max(...nums) : min
  return { minWan: min, maxWan: max }
}

/** 薪资字符串 → 年薪档位（salaryCode）；取能覆盖 max 的最低档；无法解析则不传 */
function lieSalaryCode(value: string, unit: 'month' | 'year' = 'month'): string | undefined {
  if (!value) return undefined
  const parsed = unit === 'year' ? parseYearWan(value) : parseMonthlyK(value)
  if (!parsed) return undefined
  const hit = LIE_SALARY_CODES.find((s) => parsed.maxWan >= s.min && parsed.maxWan < s.max)
  return hit?.code
}

function buildSearchUrl(query: SearchQuery, pageNum: number): string {
  const platform = query.platform ?? 'boss'
  if (platform === 'liepin') {
    const params = new URLSearchParams({ key: query.keyword })
    const code = LIE_CITY_CODES[query.city]
    if (code) params.set('dq', code)
    const sc = lieSalaryCode(query.salary, query.salaryUnit ?? 'month')
    if (sc) params.set('salaryCode', sc)
    if (pageNum > 1) params.set('curPage', String(pageNum - 1))
    return `https://www.liepin.com/zhaopin/?${params.toString()}`
  }
  const params = new URLSearchParams({ query: query.keyword })
  const code = CITY_CODES[query.city]
  if (code) params.set('city', code)
  if (query.salary) {
    const s = query.salary.replace(/k|K|万|w|薪|元/gi, '')
    const parts = s.split(/[-~至到]/).map((x: string) => x.trim()).filter((p): p is string => p.length > 0)
    if (parts.length === 1) params.set('salary', parts[0] ?? '')
    else if (parts.length >= 2) params.set('salary', (parts[0] ?? '') + (parts[parts.length - 1] ?? ''))
  }
  if (pageNum > 1) params.set('page', String(pageNum))
  return `https://www.zhipin.com/web/geek/job?${params.toString()}`
}

// ---- 页面状态诊断 ----

/** 是否正在处理任务（防止 setInterval 并发领取同一任务） */
let processing = false

function setStatus(msg: string): void {
  const el = document.getElementById('status')
  if (el) el.textContent = msg
  console.log('[workbench]', msg)
}

// ---- 注入抓取函数（自包含，executeScript 序列化后可在页面执行）----

function scrapeList(): Array<{
  externalId: string
  title: string
  salary: string
  company: string
  city: string
  url: string
  jd: string
}> {
  const isLiepin = location.hostname.includes('liepin.com')
  const result: Array<{
    externalId: string
    title: string
    salary: string
    company: string
    city: string
    url: string
    jd: string
  }> = []
  if (isLiepin) {
    const cards = document.querySelectorAll('.job-detail-box')
    for (const card of cards) {
      const a = card.querySelector('a[href*="liepin.com/job/"]') as HTMLAnchorElement | null
      if (!a || !a.href) continue
      const titleEl = card.querySelector('.ellipsis-1[title]')
      const ellipsis = card.querySelectorAll('.ellipsis-1')
      const cityEl = ellipsis.length >= 2 ? ellipsis[1] : null
      const companyEl = card.querySelector('[data-nick="job-detail-company-info"] .ellipsis-1')
      const cardText = card.innerText ?? ''
      const salary = cardText.match(/([\d.]+-[\d.]+k(?:·\d+薪)?)/i)?.[0] ?? ''
      const m = a.href.match(/liepin\.com\/(?:job|a)\/([\w\d]+)/)
      result.push({
        externalId: m?.[1] ?? '',
        title: titleEl?.textContent?.trim() ?? '',
        salary,
        company: companyEl?.textContent?.trim() ?? '',
        city: cityEl?.textContent?.trim() ?? '',
        url: a.href.split('?')[0] ?? a.href,
        jd: '',
      })
    }
    return result
  }
  const wrappers = document.querySelectorAll('.job-card-wrapper, ul.job-list-box > li, .job-primary')
  for (const el of wrappers) {
    const a = el.querySelector('a[href*="job_detail"]') as HTMLAnchorElement | null
    if (!a || !a.href) continue
    const title = el.querySelector('.job-name')?.textContent?.trim() ?? a.textContent?.trim() ?? ''
    const salary = el.querySelector('.salary')?.textContent?.trim() ?? ''
    const company = el.querySelector('.company-name')?.textContent?.trim() ?? ''
    const city =
      el.querySelector('.job-area')?.textContent?.trim() ??
      el.querySelector('.job-city')?.textContent?.trim() ??
      ''
    const m = a.href.match(/job_detail\/([\w\d]+)/)
    result.push({
      externalId: m?.[1] ?? '',
      title,
      salary,
      company,
      city,
      url: a.href.split('#')[0] ?? a.href,
      jd: '',
    })
  }
  return result
}

function scrapeJd(): string {
  if (location.hostname.includes('liepin.com')) {
    const el = document.querySelector('.job-intro-container') || document.querySelector('.job-apply-content')
    return el?.textContent?.trim() ?? ''
  }
  const el = document.querySelector('.job-sec-text') || document.querySelector('.job-detail-main')
  return el?.textContent?.trim() ?? ''
}

// ---- 抓取执行 ----

async function openTabAndScrape(url: string, fn: () => unknown, waitForCards = false): Promise<unknown[]> {
  setStatus(`打开页面: ${url.slice(0, 80)}…`)
  let tab
  try {
    tab = await browser.tabs.create({ url, active: false })
  } catch (err) {
    throw new Error(`tabs.create 失败: ${err instanceof Error ? err.message : String(err)}`)
  }
  const tabId = tab?.id
  if (tabId === undefined) {
    throw new Error('无法创建标签页（tab.id 为空）')
  }
  try {
    for (let i = 0; i < 25; i++) {
      try {
        const r = await browser.scripting.executeScript({
          target: { tabId },
          func: () => document.readyState === 'complete',
        })
        if (r[0]?.result) break
      } catch {
        // 页面导航中，重试
      }
      await sleep(1000)
      await keepAlive()
    }
    await sleep(1200 + Math.random() * 800)

    if (waitForCards) {
      for (let i = 0; i < 15; i++) {
        try {
          const r = await browser.scripting.executeScript({
            target: { tabId },
            func: () => {
              const sel =
                location.hostname.includes('liepin.com')
                  ? '.job-detail-box'
                  : '.job-card-wrapper, ul.job-list-box > li, .job-primary'
              return document.querySelector(sel) !== null
            },
          })
          if (r[0]?.result) break
        } catch {
          // 重试
        }
        await sleep(1000)
        await keepAlive()
      }
    }

    const results = await browser.scripting.executeScript({ target: { tabId }, func: fn })
    // executeScript 返回 [{ result }]（每 frame 一项）；列表抓取 fn 返回数组时会多包一层，展平为扁平数组
    return results.flatMap((r) => (Array.isArray(r.result) ? r.result : [r.result]))
  } finally {
    await browser.tabs.remove(tabId).catch(() => {})
  }
}

async function runSearch(query: SearchQuery): Promise<RawJob[]> {
  const jobs: RawJob[] = []
  const seen = new Set<string>()
  const maxPages = Math.min(12, Math.ceil(query.count / 10) + 2)
  for (let pageNum = 1; pageNum <= maxPages && jobs.length < query.count; pageNum++) {
    const items = (await openTabAndScrape(buildSearchUrl(query, pageNum), scrapeList, true)) as RawJob[]
    if (items.length === 0) break
    for (const it of items) {
      const key = it.externalId || it.url
      if (seen.has(key)) continue
      seen.add(key)
      jobs.push(it)
      if (jobs.length >= query.count) break
    }
    await sleep(randomDelay(query.delayRange))
    await keepAlive()
  }
  return jobs
}

async function runFetchJd(url: string): Promise<string> {
  const results = await openTabAndScrape(url, scrapeJd)
  return (results[0] ?? '') as string
}

// ---- 主循环：轮询 server 领任务 ----

async function postResult(body: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${SERVER}/api/ext/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // 本地服务不可达，忽略
  }
}

async function pollOnce(): Promise<void> {
  if (processing) {
    setStatus('上一任务处理中，跳过本轮轮询…')
    return
  }
  let data: { taskId?: string; id?: string; type?: string; query?: SearchQuery; url?: string } | null = null
  try {
    const res = await fetch(`${SERVER}/api/ext/task`)
    data = (await res.json()) as { taskId?: string; id?: string; type?: string; query?: SearchQuery; url?: string }
  } catch {
    return
  }
  // 兼容 server 返回的 taskId / id 两种字段
  const tid = data?.taskId ?? data?.id
  if (!tid) {
    setStatus('轮询中，暂无任务…')
    return
  }
  setStatus(`已领取任务 ${tid} (${data.type})，执行中…`)
  processing = true

  try {
    if (data.type === 'fetchJd' && data.url) {
      const jd = await runFetchJd(data.url)
      await postResult({ taskId: tid, result: jd })
      setStatus(`任务 ${tid} 完成并已回传`)
    } else if (data.query) {
      const jobs = await runSearch(data.query)
      await postResult({ taskId: tid, result: jobs })
      setStatus(`任务 ${tid} 完成：抓取 ${jobs.length} 条并回传`)
    } else {
      await postResult({ taskId: tid, error: '未知任务类型' })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setStatus(`任务 ${tid} 执行失败: ${msg}`)
    await postResult({ taskId: tid, error: msg })
  } finally {
    processing = false
  }
}

// ---- 页面加载后启动轮询（常驻页面，setInterval 持续有效）----

setStatus('抓取工作台运行中（每 3 秒轮询本地服务）')

setInterval(() => {
  void pollOnce()
}, 3000)
void pollOnce()
