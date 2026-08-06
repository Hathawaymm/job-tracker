import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const DB_PATH = path.join(DATA_DIR, 'jobtracker.db')

fs.mkdirSync(DATA_DIR, { recursive: true })

export const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

// ---- 岗位表 ----
db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL DEFAULT 'boss',
  external_id TEXT,
  url_hash TEXT,
  url TEXT,
  title TEXT NOT NULL,
  company TEXT,
  salary TEXT,
  city TEXT,
  jd TEXT,
  fetched_at TEXT NOT NULL,
  is_new INTEGER DEFAULT 1,
  hard_ok INTEGER DEFAULT 0,
  match_score INTEGER,
  match_reason TEXT,
  decision TEXT DEFAULT 'pending',
  greeting TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_url_hash ON jobs(url_hash);
CREATE INDEX IF NOT EXISTS idx_jobs_fetched ON jobs(fetched_at);
CREATE INDEX IF NOT EXISTS idx_jobs_decision ON jobs(decision);
`)

// 兼容已存在的旧表：缺列时补列
function ensureColumn(table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}
ensureColumn('jobs', 'url', 'url TEXT')

// ---- 任务配置表（单行）----
db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER DEFAULT 0,
  config TEXT,
  today_windows TEXT,
  last_run_at TEXT,
  skip_until TEXT
)
`)

// ---- 抓取技术日志表（排查用，sqlite3 查询）----
db.exec(`
CREATE TABLE IF NOT EXISTS crawl_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  triggered_by TEXT NOT NULL,
  ext_online INTEGER DEFAULT 0,
  fetched INTEGER DEFAULT 0,
  inserted INTEGER DEFAULT 0,
  skipped_dup INTEGER DEFAULT 0,
  hard_filtered INTEGER DEFAULT 0,
  scored INTEGER DEFAULT 0,
  matched INTEGER DEFAULT 0,
  jd_fetched INTEGER DEFAULT 0,
  task_claimed_at TEXT,
  task_result_at TEXT,
  task_error TEXT,
  status TEXT DEFAULT 'running',
  error TEXT,
  duration_ms INTEGER
)
`)

export interface TaskConfig {
  keyword: string
  city: string
  salary: string
  salaryUnit: 'month' | 'year'
  platform: 'boss' | 'liepin'
  count: number
  threshold: number
  minNew: number
  poolDays: number
  delayRange: [number, number]
  resumeText: string
}

export const DEFAULT_TASK_CONFIG: TaskConfig = {
  keyword: '',
  city: '',
  salary: '',
  salaryUnit: 'month',
  platform: 'liepin',
  count: 50,
  threshold: 65,
  minNew: 3,
  poolDays: 5,
  delayRange: [3, 8],
  resumeText: '',
}

export interface TaskRow {
  id: number
  enabled: number
  config: string
  today_windows: string | null
  last_run_at: string | null
  skip_until: string | null
}

export function getTask(): TaskRow {
  const row = db.prepare('SELECT * FROM tasks WHERE id = 1').get() as TaskRow | undefined
  if (row) return row
  db.prepare('INSERT INTO tasks (id, enabled, config) VALUES (1, 0, ?)').run(JSON.stringify(DEFAULT_TASK_CONFIG))
  return getTask()
}

export function getTaskConfig(): TaskConfig {
  const task = getTask()
  try {
    return { ...DEFAULT_TASK_CONFIG, ...(JSON.parse(task.config) as Partial<TaskConfig>) }
  } catch {
    return DEFAULT_TASK_CONFIG
  }
}

export function updateTask(patch: Partial<Pick<TaskRow, 'enabled' | 'config' | 'today_windows' | 'last_run_at' | 'skip_until'>>): void {
  const task = getTask()
  const next: TaskRow = { ...task, ...patch }
  db.prepare(
    'UPDATE tasks SET enabled = ?, config = ?, today_windows = ?, last_run_at = ?, skip_until = ? WHERE id = 1',
  ).run(next.enabled, next.config, next.today_windows, next.last_run_at, next.skip_until)
}

// ---- 岗位查询 ----
export interface JobRow {
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

export function insertJob(job: Omit<JobRow, 'id'>): number {
  const res = db
    .prepare(
      `INSERT INTO jobs (platform, external_id, url_hash, url, title, company, salary, city, jd,
        fetched_at, is_new, hard_ok, match_score, match_reason, decision, greeting)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      job.platform,
      job.external_id,
      job.url_hash,
      job.url,
      job.title,
      job.company,
      job.salary,
      job.city,
      job.jd,
      job.fetched_at,
      job.is_new,
      job.hard_ok,
      job.match_score,
      job.match_reason,
      job.decision,
      job.greeting,
    )
  return Number(res.lastInsertRowid)
}

export function findDecidedByHash(urlHash: string): string | null {
  const row = db
    .prepare('SELECT decision FROM jobs WHERE url_hash = ? AND decision IN (?, ?) ORDER BY id DESC LIMIT 1')
    .get(urlHash, 'confirmed', 'ignored') as { decision: string } | undefined
  return row?.decision ?? null
}

export function findPoolJobs(config: TaskConfig, limit = 50): JobRow[] {
  const cutoff = new Date(Date.now() - config.poolDays * 24 * 3600 * 1000).toISOString()
  return db
    .prepare(
      `SELECT * FROM jobs
       WHERE decision = 'pending' AND match_score >= ? AND fetched_at >= ?
       ORDER BY match_score DESC, fetched_at DESC
       LIMIT ?`,
    )
    .all(config.threshold, cutoff, limit) as JobRow[]
}

export function getJobById(id: number): JobRow | undefined {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined
}

export function setDecision(id: number, decision: 'confirmed' | 'ignored'): void {
  db.prepare('UPDATE jobs SET decision = ? WHERE id = ?').run(decision, id)
}

export function updateJobMatch(id: number, score: number, reason: string): void {
  db.prepare('UPDATE jobs SET match_score = ?, match_reason = ?, hard_ok = 1, is_new = 0 WHERE id = ?').run(score, reason, id)
}

export function updateJobJd(id: number, jd: string): void {
  db.prepare('UPDATE jobs SET jd = ? WHERE id = ?').run(jd, id)
}

export function countNewSince(threshold: number, sinceIso: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM jobs WHERE match_score >= ? AND fetched_at >= ?')
    .get(threshold, sinceIso) as { n: number }
  return row.n
}

export function recentRuns(limit = 50): Array<{ fetched_at: string; title: string; company: string; match_score: number | null; decision: string }> {
  return db
    .prepare('SELECT fetched_at, title, company, match_score, decision FROM jobs ORDER BY fetched_at DESC LIMIT ?')
    .all(limit) as Array<{ fetched_at: string; title: string; company: string; match_score: number | null; decision: string }>
}

// ---- 个人经历库（跨端持久，SQLite）----
db.exec(`
CREATE TABLE IF NOT EXISTS experience_bank (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT DEFAULT '',
  name TEXT NOT NULL,
  role TEXT DEFAULT '',
  period TEXT DEFAULT '',
  description TEXT DEFAULT '',
  points_json TEXT DEFAULT '[]',
  tags_json TEXT DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
`)

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

function rowToExperience(row: Record<string, unknown>): ExperienceItem {
  return {
    id: row.id as number,
    company: (row.company as string) ?? '',
    name: row.name as string,
    role: (row.role as string) ?? '',
    period: (row.period as string) ?? '',
    description: (row.description as string) ?? '',
    points: JSON.parse((row.points_json as string) || '[]') as string[],
    tags: JSON.parse((row.tags_json as string) || '[]') as string[],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function listExperiences(): ExperienceItem[] {
  const rows = db.prepare('SELECT * FROM experience_bank ORDER BY updated_at DESC').all() as Array<Record<string, unknown>>
  return rows.map(rowToExperience)
}

export function insertExperience(input: ExperienceInput): ExperienceItem {
  const ts = new Date().toISOString()
  const res = db
    .prepare(
      `INSERT INTO experience_bank (company, name, role, period, description, points_json, tags_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.company ?? '',
      input.name,
      input.role ?? '',
      input.period ?? '',
      input.description ?? '',
      JSON.stringify(input.points ?? []),
      JSON.stringify(input.tags ?? []),
      ts,
      ts,
    )
  const id = Number(res.lastInsertRowid)
  const row = db.prepare('SELECT * FROM experience_bank WHERE id = ?').get(id) as Record<string, unknown>
  return rowToExperience(row)
}

export function updateExperience(id: number, input: ExperienceInput): ExperienceItem | null {
  const existing = db.prepare('SELECT * FROM experience_bank WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!existing) return null
  const ts = new Date().toISOString()
  db.prepare(
    `UPDATE experience_bank SET company = ?, name = ?, role = ?, period = ?, description = ?, points_json = ?, tags_json = ?, updated_at = ? WHERE id = ?`,
  ).run(
    input.company ?? '',
    input.name,
    input.role ?? '',
    input.period ?? '',
    input.description ?? '',
    JSON.stringify(input.points ?? []),
    JSON.stringify(input.tags ?? []),
    ts,
    id,
  )
  const row = db.prepare('SELECT * FROM experience_bank WHERE id = ?').get(id) as Record<string, unknown>
  return rowToExperience(row)
}

export function deleteExperience(id: number): boolean {
  const res = db.prepare('DELETE FROM experience_bank WHERE id = ?').run(id)
  return res.changes > 0
}

// ---- 抓取技术日志 ----

export interface CrawlLogPatch {
  finished_at?: string
  ext_online?: number
  fetched?: number
  inserted?: number
  skipped_dup?: number
  hard_filtered?: number
  scored?: number
  matched?: number
  jd_fetched?: number
  task_claimed_at?: string
  task_result_at?: string
  task_error?: string
  status?: string
  error?: string
  duration_ms?: number
}

/** 抓取开始时插入一条技术日志，返回日志 id */
export function insertCrawlLog(startedAt: string, triggeredBy: string, extOnline: boolean): number {
  const res = db
    .prepare('INSERT INTO crawl_logs (started_at, triggered_by, ext_online, status) VALUES (?, ?, ?, ?)')
    .run(startedAt, triggeredBy, extOnline ? 1 : 0, 'running')
  return Number(res.lastInsertRowid)
}

/** 更新一条抓取日志（动态字段） */
export function updateCrawlLog(id: number, patch: CrawlLogPatch): void {
  const keys = Object.keys(patch) as Array<keyof CrawlLogPatch>
  if (keys.length === 0) return
  const sets = keys.map((k) => `${k} = ?`).join(', ')
  const values = keys.map((k) => patch[k])
  db.prepare(`UPDATE crawl_logs SET ${sets} WHERE id = ?`).run(...values, id)
}

/** 最近抓取日志（排查用） */
export function listCrawlLogs(limit = 20): CrawlLogRow[] {
  return db.prepare('SELECT * FROM crawl_logs ORDER BY id DESC LIMIT ?').all(limit) as CrawlLogRow[]
}

export interface CrawlLogRow {
  id: number
  started_at: string
  finished_at: string | null
  triggered_by: string
  ext_online: number
  fetched: number
  inserted: number
  skipped_dup: number
  hard_filtered: number
  scored: number
  matched: number
  jd_fetched: number
  task_claimed_at: string | null
  task_result_at: string | null
  task_error: string
  status: string
  error: string
  duration_ms: number | null
}
