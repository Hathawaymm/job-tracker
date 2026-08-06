// ---- 岗位面试流程状态 ----
export type JobStatus =
  | 'applied'
  | 'screening'
  | 'written'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  applied: '已投递',
  screening: '简历筛选中',
  written: '笔试/测试',
  interview: '面试中',
  offer: 'Offer',
  rejected: '已拒绝',
  withdrawn: '已撤回',
}

// ---- 投递清单阶段 ----
export type ApplicationStage =
  | 'new'
  | 'confirmed'
  | 'greeted'
  | 'submitted'
  | 'active'
  | 'closed'

export const APPLICATION_STAGE_LABELS: Record<ApplicationStage, string> = {
  new: '待确认',
  confirmed: '已确认',
  greeted: '话术就绪',
  submitted: '已投递',
  active: '进行中',
  closed: '已结束',
}

// ---- AI 匹配结果 ----
export interface MatchResult {
  score: number
  fitLevel: 'high' | 'medium' | 'low' | 'reject'
  reason: string
  suggestion: string
  checkedAt: string
}

// ---- 招呼语 ----
export interface Greeting {
  text: string
  model: string
  createdAt: string
}

// ---- 岗位 ----
export interface Job {
  id: string
  company: string
  title: string
  city: string
  salary: string
  channel: string
  url: string
  jdText: string
  jdImageDataUri?: string
  source: 'manual' | 'screenshot'
  createdAt: string
  updatedAt: string
  status: JobStatus
  match?: MatchResult | null
  confirmed: boolean
  greeting?: Greeting | null
  submittedAt?: string | null
  notes: string
}

// ---- 面试记录 ----
export interface InterviewRecord {
  id: string
  jobId: string
  round: string
  date: string
  content: string
  review: string
  result: 'pending' | 'passed' | 'failed' | 'offer'
}

export const INTERVIEW_RESULT_LABELS: Record<InterviewRecord['result'], string> = {
  pending: '待定',
  passed: '通过',
  failed: '未通过',
  offer: 'Offer',
}

// ---- 投递日志 ----
export interface LogEntry {
  id: string
  jobId: string
  company: string
  title: string
  action: string
  detail: string
  at: string
}

// ---- 简历 ----
export interface WorkExperience {
  id: string
  company: string
  role: string
  period: string
  highlights: string[]
}

export interface Project {
  id: string
  company: string
  name: string
  role: string
  description: string
  points: string[]
}

export interface Education {
  id: string
  school: string
  major: string
  degree: string
  period: string
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

export interface Resume {
  name: string
  title: string
  city: string
  phone: string
  email: string
  summary: string
  skills: string[]
  experiences: WorkExperience[]
  projects: Project[]
  education: Education[]
}

// ---- 简历版本 ----
export interface ResumeVersion {
  id: string
  name: string
  resume: Resume
  createdAt: string
  updatedAt: string
}

// ---- 整体应用数据（localStorage 快照 / JSON 导入导出）----
export interface AppData {
  resumes: ResumeVersion[]
  jobs: Job[]
  interviews: InterviewRecord[]
  logs: LogEntry[]
}
