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

export interface TaskConfig {
  keyword: string
  city: string
  salary: string
  platform: 'boss'
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
  platform: 'boss',
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
