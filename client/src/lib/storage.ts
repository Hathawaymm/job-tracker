import type { AppData, InterviewRecord, Job, LogEntry, Resume, ResumeVersion } from '../types'
import { nowIso, uid } from './id'

const PREFIX = 'jobtracker:'

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function save<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function emptyResume(): Resume {
  return {
    name: '',
    title: '',
    city: '',
    phone: '',
    email: '',
    summary: '',
    skills: [],
    experiences: [],
    projects: [],
    education: [],
  }
}

export function emptyData(): AppData {
  return { resumes: [], jobs: [], interviews: [], logs: [] }
}

const RESUME_KEY = 'resume' // 旧版单份简历（迁移读取）
const RESUMES_KEY = 'resumes'
const SEL_PREFIX = 'resumeSel:'
const JOBS_KEY = 'jobs'
const INTERVIEWS_KEY = 'interviews'
const LOGS_KEY = 'logs'

export function makeResumeVersion(name: string, resume: Resume): ResumeVersion {
  const ts = nowIso()
  return { id: uid(), name, resume, createdAt: ts, updatedAt: ts }
}

/** 旧版单份简历是否有效（非全空） */
function isMeaningfulResume(r: Resume): boolean {
  return Boolean(r.name || r.title || r.summary || r.projects.length > 0 || r.experiences.length > 0)
}

export function loadAll(): AppData {
  let resumes = load<ResumeVersion[]>(RESUMES_KEY, [])
  // 迁移：旧版单份简历 → 第一个版本
  if (resumes.length === 0) {
    const legacy = load<Resume | null>(RESUME_KEY, null)
    if (legacy && isMeaningfulResume(legacy)) {
      resumes = [makeResumeVersion('我的简历', legacy)]
    }
  }
  // 兜底：至少一个空白版本
  if (resumes.length === 0) {
    resumes = [makeResumeVersion('我的简历', emptyResume())]
  }
  return {
    resumes,
    jobs: load<Job[]>(JOBS_KEY, []),
    interviews: load<InterviewRecord[]>(INTERVIEWS_KEY, []),
    logs: load<LogEntry[]>(LOGS_KEY, []),
  }
}

export function saveAll(data: AppData): void {
  saveResumes(data.resumes)
  save(JOBS_KEY, data.jobs)
  save(INTERVIEWS_KEY, data.interviews)
  save(LOGS_KEY, data.logs)
}

/** 保存除简历外的数据（简历版本为手动保存） */
export function saveNonResume(data: AppData): void {
  save(JOBS_KEY, data.jobs)
  save(INTERVIEWS_KEY, data.interviews)
  save(LOGS_KEY, data.logs)
}

/** 手动保存全部简历版本，返回是否成功 */
export function saveResumes(versions: ResumeVersion[]): boolean {
  return save<ResumeVersion[]>(RESUMES_KEY, versions)
}

// ---- 各模块「使用简历」选择记忆 ----
export function loadSelectedVersionId(module: string): string | null {
  return load<string | null>(SEL_PREFIX + module, null)
}

export function saveSelectedVersionId(module: string, id: string): boolean {
  return save(SEL_PREFIX + module, id)
}

export function makeJob(partial: Partial<Job>): Job {
  const ts = nowIso()
  return {
    id: partial.id ?? uid(),
    company: partial.company ?? '',
    title: partial.title ?? '',
    city: partial.city ?? '',
    salary: partial.salary ?? '',
    channel: partial.channel ?? 'BOSS直聘',
    url: partial.url ?? '',
    jdText: partial.jdText ?? '',
    jdImageDataUri: partial.jdImageDataUri,
    source: partial.source ?? 'manual',
    createdAt: partial.createdAt ?? ts,
    updatedAt: partial.updatedAt ?? ts,
    status: partial.status ?? 'applied',
    match: partial.match ?? null,
    confirmed: partial.confirmed ?? false,
    greeting: partial.greeting ?? null,
    submittedAt: partial.submittedAt ?? null,
    notes: partial.notes ?? '',
  }
}

export function exportJson(data: AppData): string {
  return JSON.stringify({ app: 'job-tracker', version: 2, exportedAt: nowIso(), data }, null, 2)
}

/** 解析导入 JSON，兼容新版（resumes）与旧版（单份 resume） */
export function parseImportJson(text: string): AppData | null {
  try {
    const parsed = JSON.parse(text) as { data?: unknown }
    const raw = (parsed.data ?? parsed) as Record<string, unknown>
    if (!raw || typeof raw !== 'object') return null

    const jobs = Array.isArray(raw.jobs) ? (raw.jobs as Job[]) : []
    const interviews = Array.isArray(raw.interviews) ? (raw.interviews as InterviewRecord[]) : []
    const logs = Array.isArray(raw.logs) ? (raw.logs as LogEntry[]) : []

    if (Array.isArray(raw.resumes)) {
      const resumes = (raw.resumes as ResumeVersion[]).map((v) => ({
        ...v,
        resume: { ...emptyResume(), ...(v.resume ?? {}) },
      }))
      if (resumes.length === 0) resumes.push(makeResumeVersion('我的简历', emptyResume()))
      return { resumes, jobs, interviews, logs }
    }

    if (raw.resume && typeof raw.resume === 'object') {
      const resume = { ...emptyResume(), ...(raw.resume as Partial<Resume>) }
      return { resumes: [makeResumeVersion('我的简历', resume)], jobs, interviews, logs }
    }

    // 旧版兜底：可能只有 jobs 等数据，无简历字段
    if (Array.isArray(raw.jobs) || Array.isArray(raw.interviews) || Array.isArray(raw.logs)) {
      return { resumes: [makeResumeVersion('我的简历', emptyResume())], jobs, interviews, logs }
    }

    return null
  } catch {
    return null
  }
}

/** 下载 JSON 备份文件 */
export function downloadJson(data: AppData, filename = `job-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`): void {
  const blob = new Blob([exportJson(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
