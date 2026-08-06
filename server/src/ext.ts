import type { RawJob, SearchQuery } from './adapters/types.js'
import { updateCrawlLog } from './db.js'
import { log } from './logger.js'

// ---------------------------------------------------------------------------
// 扩展抓取任务队列：web 端抓取 → 排任务 → 扩展轮询领取 → 结果回传
// ---------------------------------------------------------------------------

interface PendingTask {
  id: string
  type: 'search' | 'fetchJd'
  query?: SearchQuery
  url?: string
  crawlLogId?: number
  claimed: boolean
  claimedAt: number
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
}

const pending = new Map<string, PendingTask>()
let lastHeartbeat = 0
let counter = 0

/** 领取后若超时未回传，视为扩展已崩溃/中断，重置为可再次领取 */
const CLAIM_TIMEOUT_MS = 60000

/** 扩展每次轮询时更新心跳 */
export function touchHeartbeat(): void {
  lastHeartbeat = Date.now()
}

/** 扩展是否在线（8 秒内有过心跳） */
export function isExtensionOnline(): boolean {
  return Date.now() - lastHeartbeat < 8000
}

function uid(): string {
  return `t${Date.now().toString(36)}${(counter++).toString(36)}`
}

/** 排一个「列表抓取」任务，返回抓到的岗位数组（抓满 count 或翻完页自然完成；宽松兜底防挂起） */
export function enqueueSearch(query: SearchQuery, timeoutMs = 900000, crawlLogId?: number): Promise<RawJob[]> {
  return new Promise((resolve, reject) => {
    const id = uid()
    const timer = setTimeout(() => {
      pending.delete(id)
      if (crawlLogId !== undefined) {
        updateCrawlLog(crawlLogId, { task_error: 'server 侧超时未回传', status: 'error', error: '任务超时：扩展未在期限内回传' })
      }
      reject(new Error('抓取超时：可能因网络慢或 BOSS 反爬，建议降低单次抓取数量后重试'))
    }, timeoutMs)
    pending.set(id, { id, type: 'search', query, crawlLogId, claimed: false, claimedAt: 0, resolve: (v) => resolve(v as RawJob[]), reject, timer })
  })
}

/** 排一个「补 JD」任务，返回岗位详情文本 */
export function enqueueFetchJd(url: string, timeoutMs = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = uid()
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('JD 详情抓取超时：可能因网络慢，请重试'))
    }, timeoutMs)
    pending.set(id, { id, type: 'fetchJd', url, claimed: false, claimedAt: 0, resolve: (v) => resolve(String(v)), reject, timer })
  })
}

/** 扩展轮询：领取一个待执行任务（返回 taskId，与无任务分支字段一致；claimed 防多实例重复领取） */
export function peekTask(): { taskId: string; type: string; query?: SearchQuery; url?: string } | null {
  for (const t of pending.values()) {
    // 已领取但超时未回传 → 重置可见，允许重新领取
    if (t.claimed && Date.now() - t.claimedAt > CLAIM_TIMEOUT_MS) {
      t.claimed = false
    }
    if (t.claimed) continue
    t.claimed = true
    t.claimedAt = Date.now()
    if (t.crawlLogId !== undefined) {
      updateCrawlLog(t.crawlLogId, { task_claimed_at: new Date().toISOString() })
    }
    log.info('ext', `任务被领取 taskId=${t.id} type=${t.type} crawlLogId=${t.crawlLogId ?? '-'}`)
    return { taskId: t.id, type: t.type, query: t.query, url: t.url }
  }
  return null
}

/** 任务完成（结果回传） */
export function completeTask(id: string, result: unknown): boolean {
  const t = pending.get(id)
  if (!t) return false
  clearTimeout(t.timer)
  pending.delete(id)
  if (t.crawlLogId !== undefined) {
    updateCrawlLog(t.crawlLogId, { task_result_at: new Date().toISOString() })
  }
  const shape = Array.isArray(result)
    ? `array[${result.length}]`
    : typeof result === 'object' && result !== null
      ? `object{${Object.keys(result as object).join(',')}}`
      : typeof result
  log.info('ext', `任务完成 taskId=${id} type=${t.type} resultShape=${shape}`)
  t.resolve(result)
  return true
}

/** 任务失败 */
export function failTask(id: string, error: string): boolean {
  const t = pending.get(id)
  if (!t) return false
  clearTimeout(t.timer)
  pending.delete(id)
  if (t.crawlLogId !== undefined) {
    updateCrawlLog(t.crawlLogId, { task_result_at: new Date().toISOString(), task_error: error })
  }
  log.error('ext', `任务失败 taskId=${id} type=${t.type} error=${error}`)
  t.reject(new Error(error))
  return true
}

/** 清空全部待处理任务（server 重启时） */
export function clearTasks(): void {
  for (const t of pending.values()) {
    clearTimeout(t.timer)
    t.reject(new Error('服务重启，任务已取消'))
  }
  pending.clear()
}

// ---------------------------------------------------------------------------
// 抓取实时进度（内存状态）
// ---------------------------------------------------------------------------

export interface CrawlProgress {
  phase: 'idle' | 'crawling' | 'scoring' | 'done'
  platform: string
  fetched: number
  total: number
  scored: number
  matched: number
  error?: string
}

let progress: CrawlProgress = { phase: 'idle', platform: '', fetched: 0, total: 0, scored: 0, matched: 0 }

export function setProgress(p: Partial<CrawlProgress>): void {
  progress = { ...progress, ...p }
}

export function getProgress(): CrawlProgress {
  return progress
}
