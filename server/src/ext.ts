import type { RawJob, SearchQuery } from './adapters/types.js'

// ---------------------------------------------------------------------------
// 扩展抓取任务队列：web 端抓取 → 排任务 → 扩展轮询领取 → 结果回传
// ---------------------------------------------------------------------------

interface PendingTask {
  id: string
  type: 'search' | 'fetchJd'
  query?: SearchQuery
  url?: string
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
}

const pending = new Map<string, PendingTask>()
let lastHeartbeat = 0
let counter = 0

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

/** 排一个「列表抓取」任务，返回抓到的岗位数组 */
export function enqueueSearch(query: SearchQuery, timeoutMs = 180000): Promise<RawJob[]> {
  return new Promise((resolve, reject) => {
    const id = uid()
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('抓取超时：扩展未在 3 分钟内完成任务'))
    }, timeoutMs)
    pending.set(id, { id, type: 'search', query, resolve: (v) => resolve(v as RawJob[]), reject, timer })
  })
}

/** 排一个「补 JD」任务，返回岗位详情文本 */
export function enqueueFetchJd(url: string, timeoutMs = 60000): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = uid()
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('JD 详情抓取超时'))
    }, timeoutMs)
    pending.set(id, { id, type: 'fetchJd', url, resolve: (v) => resolve(String(v)), reject, timer })
  })
}

/** 扩展轮询：领取一个待执行任务 */
export function peekTask(): { id: string; type: string; query?: SearchQuery; url?: string } | null {
  for (const t of pending.values()) {
    return { id: t.id, type: t.type, query: t.query, url: t.url }
  }
  return null
}

/** 任务完成（结果回传） */
export function completeTask(id: string, result: unknown): boolean {
  const t = pending.get(id)
  if (!t) return false
  clearTimeout(t.timer)
  pending.delete(id)
  t.resolve(result)
  return true
}

/** 任务失败 */
export function failTask(id: string, error: string): boolean {
  const t = pending.get(id)
  if (!t) return false
  clearTimeout(t.timer)
  pending.delete(id)
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
