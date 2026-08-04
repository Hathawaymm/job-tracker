export interface TaskConfigPayload {
  keyword: string
  city: string
  salary: string
  platform: string
  count: number
  threshold: number
  minNew: number
  poolDays: number
  delayRange: [number, number]
  hasResume: boolean
}

export interface TaskInfo {
  enabled: boolean
  config: TaskConfigPayload
  todayWindows: { date: string; windows: Array<{ label: string; time: string; executed: boolean }> } | null
  lastRunAt: string | null
  skipUntil: string | null
}

export interface PoolJob {
  id: number
  platform: string
  external_id: string | null
  url_hash: string | null
  url: string
  title: string
  company: string
  salary: string
  city: string
  jd: string
  fetched_at: string
  is_new: number
  hard_ok: number
  match_score: number | null
  match_reason: string
  decision: string
  greeting: string
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `请求失败（HTTP ${res.status}）`)
  }
  return (await res.json()) as T
}

export async function getTasks(): Promise<TaskInfo> {
  return request<TaskInfo>('/api/jobs/tasks')
}

export interface TaskUpdatePayload {
  keyword?: string
  city?: string
  salary?: string
  platform?: string
  count?: number
  threshold?: number
  minNew?: number
  poolDays?: number
  delayRange?: [number, number]
  resumeText?: string
  enabled?: boolean
}

export async function updateTasks(patch: TaskUpdatePayload): Promise<void> {
  await request<{ ok: boolean }>('/api/jobs/tasks', { method: 'PUT', body: JSON.stringify(patch) })
}

export async function triggerCrawl(resumeText?: string): Promise<{ message: string }> {
  return request<{ message: string }>('/api/jobs/run', { method: 'POST', body: JSON.stringify({ resumeText }) })
}

export async function getRunStatus(): Promise<{ running: boolean; lastResult: RunResult | null }> {
  return request<{ running: boolean; lastResult: RunResult | null }>('/api/jobs/run/status')
}

export async function getPool(): Promise<PoolJob[]> {
  const data = await request<{ jobs: PoolJob[] }>('/api/jobs/pool')
  return data.jobs
}

export async function setJobDecision(id: number, decision: 'confirmed' | 'ignored'): Promise<PoolJob> {
  return request<PoolJob>(`/api/jobs/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision }) })
}

export interface JobLogRow {
  fetched_at: string
  title: string
  company: string
  match_score: number | null
  decision: string
}

export async function getJobLogs(): Promise<JobLogRow[]> {
  const data = await request<{ runs: JobLogRow[] }>('/api/jobs/logs')
  return data.runs
}

/** 抓取扩展在线状态 */
export async function getExtStatus(): Promise<{ online: boolean }> {
  return request<{ online: boolean }>('/api/ext/status')
}

export type FitLevel = 'high' | 'medium' | 'low' | 'reject'

/** 匹配分数 → 展示等级（池内已是 ≥65%） */
export function fitLevelFromScore(score: number): FitLevel {
  if (score >= 80) return 'high'
  if (score >= 65) return 'medium'
  if (score >= 50) return 'low'
  return 'reject'
}
