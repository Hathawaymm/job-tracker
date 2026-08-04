// AI 求职助手抓取扩展 - 后台 Service Worker
// 机制：chrome.alarms 保活 + setInterval 轮询本地 server 领取抓取任务
//   → 后台开 BOSS 搜索 tab → 注入抓取脚本（复用登录态）→ 结果回传 server

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
}

const SERVER = 'http://127.0.0.1:3001'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function randomDelay([min, max]: [number, number]): number {
  return (min + Math.random() * (max - min)) * 1000
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

function buildSearchUrl(query: SearchQuery, pageNum: number): string {
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
  const result: Array<{
    externalId: string
    title: string
    salary: string
    company: string
    city: string
    url: string
    jd: string
  }> = []
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
  const el = document.querySelector('.job-sec-text') || document.querySelector('.job-detail-main')
  return el?.textContent?.trim() ?? ''
}

// ---- 抓取执行 ----

async function openTabAndScrape(url: string, fn: () => unknown): Promise<unknown[]> {
  const tab = await browser.tabs.create({ url, active: false })
  const tabId = tab.id
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
        if (r[0]?.result) {
          await sleep(1500 + Math.random() * 1000)
          break
        }
      } catch {
        // 页面导航中，重试
      }
      await sleep(1000)
    }
    const results = await browser.scripting.executeScript({ target: { tabId }, func: fn })
    return results.map((r) => r.result)
  } finally {
    await browser.tabs.remove(tabId).catch(() => {})
  }
}

async function runSearch(query: SearchQuery): Promise<RawJob[]> {
  const jobs: RawJob[] = []
  const seen = new Set<string>()
  for (let pageNum = 1; pageNum <= 8 && jobs.length < query.count; pageNum++) {
    const items = (await openTabAndScrape(buildSearchUrl(query, pageNum), scrapeList)) as RawJob[]
    if (items.length === 0) break
    for (const it of items) {
      const key = it.externalId || it.url
      if (seen.has(key)) continue
      seen.add(key)
      jobs.push(it)
      if (jobs.length >= query.count) break
    }
    await sleep(randomDelay(query.delayRange))
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
  let data: { taskId?: string; type?: string; query?: SearchQuery; url?: string } | null = null
  try {
    const res = await fetch(`${SERVER}/api/ext/task`)
    data = (await res.json()) as { taskId?: string; type?: string; query?: SearchQuery; url?: string }
  } catch {
    return
  }
  if (!data?.taskId) return

  try {
    if (data.type === 'fetchJd' && data.url) {
      const jd = await runFetchJd(data.url)
      await postResult({ taskId: data.taskId, result: jd })
    } else if (data.query) {
      const jobs = await runSearch(data.query)
      await postResult({ taskId: data.taskId, result: jobs })
    } else {
      await postResult({ taskId: data.taskId, error: '未知任务类型' })
    }
  } catch (err) {
    await postResult({ taskId: data.taskId, error: err instanceof Error ? err.message : String(err) })
  }
}

export default defineBackground(() => {
  // alarm 保活：SW 被回收后 30s 内唤醒并重启轮询
  void browser.alarms.create('poll', { periodInMinutes: 0.5 })
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'poll') ensurePolling()
  })

  let timer: ReturnType<typeof setInterval> | undefined
  function ensurePolling(): void {
    if (timer) return
    timer = setInterval(() => {
      void pollOnce()
    }, 3000)
  }

  ensurePolling()
  void pollOnce()
})
