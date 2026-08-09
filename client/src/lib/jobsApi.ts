export interface TaskConfigPayload {
  keyword: string
  city: string
  salary: string
  salaryUnit: 'month' | 'year'
  platform: string
  count: number
  threshold: number
  minNew: number
  poolDays: number
  delayRange: [number, number]
  hasResume: boolean
  targetIndustries: string[]
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
  salaryUnit?: 'month' | 'year'
  platform?: string
  count?: number
  threshold?: number
  minNew?: number
  poolDays?: number
  delayRange?: [number, number]
  resumeText?: string
  targetIndustries?: string[]
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

export interface ManualFetchResult {
  ok: boolean
  job: PoolJob
  error?: string
}

/** 手动新增：按招聘链接抓取岗位并入库（绕过列表反爬，走扩展 fetchJd 通道） */
export async function manualFetchJob(url: string, platform?: string): Promise<ManualFetchResult> {
  return request<ManualFetchResult>('/api/jobs/manual', { method: 'POST', body: JSON.stringify({ url, platform }) })
}

/** 抓取扩展在线状态 */
export async function getExtStatus(): Promise<{ online: boolean }> {
  return request<{ online: boolean }>('/api/ext/status')
}

export interface CrawlProgress {
  phase: 'idle' | 'crawling' | 'scoring' | 'done'
  platform: string
  fetched: number
  total: number
  scored: number
  matched: number
  error?: string
}

/** 抓取实时进度 */
export async function getCrawlProgress(): Promise<{ progress: CrawlProgress; running: boolean }> {
  return request<{ progress: CrawlProgress; running: boolean }>('/api/jobs/progress')
}

export type FitLevel = 'high' | 'medium' | 'low' | 'reject'

/** 匹配分数 → 展示等级（池内已是 ≥65%） */
export function fitLevelFromScore(score: number): FitLevel {
  if (score >= 80) return 'high'
  if (score >= 65) return 'medium'
  if (score >= 50) return 'low'
  return 'reject'
}

// ---- 个人经历库（server SQLite 持久化）----
export interface ExperienceItem {
  id: number
  company: string
  name: string
  role: string
  period: string
  description: string
  points: string[]
  tags: string[]
  createdAt: string
  updatedAt: string
}

export type ExperienceInput = Omit<ExperienceItem, 'id' | 'createdAt' | 'updatedAt'>

export async function getExperiences(): Promise<ExperienceItem[]> {
  const data = await request<{ items: ExperienceItem[] }>('/api/experiences')
  return data.items
}

export async function createExperience(input: ExperienceInput): Promise<ExperienceItem> {
  const data = await request<{ ok: boolean; item: ExperienceItem }>('/api/experiences', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return data.item
}

export async function updateExperience(id: number, input: ExperienceInput): Promise<ExperienceItem> {
  const data = await request<{ ok: boolean; item: ExperienceItem }>(`/api/experiences/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  return data.item
}

export async function deleteExperience(id: number): Promise<boolean> {
  const data = await request<{ ok: boolean }>(`/api/experiences/${id}`, { method: 'DELETE' })
  return data.ok
}
