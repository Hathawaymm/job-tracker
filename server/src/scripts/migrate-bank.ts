/**
 * 存量迁移：把备份 JSON（导出备份）中「updatedAt 最新」简历版本的
 * 工作经历 / 教育经历 / 基本信息写入个人经历库（experience_bank）。
 * - 项目经历不迁移（经历库已有项目数据，避免重复）
 * - 幂等：已存在的 type+name 跳过
 *
 * 用法：
 *   cd server && npx tsx src/scripts/migrate-bank.ts <备份.json>
 */
import fs from 'fs'
import { db } from '../db.js'

interface BackupData {
  resumes?: Array<{
    id?: string
    name?: string
    updatedAt?: string
    resume?: {
      name?: string
      title?: string
      city?: string
      phone?: string
      email?: string
      summary?: string
      skills?: string[]
      experiences?: Array<{ company?: string; role?: string; period?: string; highlights?: string[] }>
      education?: Array<{ school?: string; major?: string; degree?: string; period?: string }>
    }
  }>
}

const filePath = process.argv[2]
if (!filePath) {
  console.error('用法：npx tsx src/scripts/migrate-bank.ts <备份.json>')
  process.exit(1)
}

const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { data?: unknown } & Record<string, unknown>
// 兼容 v2 备份格式（{data:{resumes}}）与旧版顶层（{resumes}）
const source = (raw.data ?? raw) as BackupData
const resumes = source.resumes ?? []
if (resumes.length === 0) {
  console.error('备份文件中没有 resumes（简历版本），请确认导出的是本工具的备份文件')
  process.exit(1)
}

const latest = [...resumes].sort((a, b) => ((a.updatedAt ?? '') < (b.updatedAt ?? '') ? 1 : -1))[0]
const r = latest.resume
if (!r) {
  console.error(`版本「${latest.name}」没有 resume 内容`)
  process.exit(1)
}
console.log(`使用版本：${latest.name}（updatedAt=${latest.updatedAt ?? '未知'}）`)

const existing = new Set(
  (db.prepare('SELECT type, name FROM experience_bank').all() as Array<{ type: string; name: string }>).map(
    (x) => `${x.type}|${x.name}`,
  ),
)

let inserted = 0
const insert = (type: string, name: string, fields: Record<string, unknown>, dedupeKey?: string) => {
  if (!name.trim()) return
  const key = dedupeKey ?? `${type}|${name.trim()}`
  if (existing.has(key)) {
    console.log(`  - 跳过（已存在）：${name.trim()}`)
    return
  }
  const ts = new Date().toISOString()
  db.prepare(
    `INSERT INTO experience_bank (type, company, name, role, period, description, points_json, tags_json, school, major, degree, highlights_json, title, city, phone, email, summary, skills_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    type,
    fields.company ?? '',
    name.trim(),
    fields.role ?? '',
    fields.period ?? '',
    fields.description ?? '',
    JSON.stringify(fields.points ?? []),
    JSON.stringify(fields.tags ?? []),
    fields.school ?? '',
    fields.major ?? '',
    fields.degree ?? '',
    JSON.stringify(fields.highlights ?? []),
    fields.title ?? '',
    fields.city ?? '',
    fields.phone ?? '',
    fields.email ?? '',
    fields.summary ?? '',
    JSON.stringify(fields.skills ?? []),
    ts,
    ts,
  )
  existing.add(key)
  inserted++
  console.log(`  + 导入：${name.trim()}`)
}

console.log('— 工作经历 —')
for (const e of r.experiences ?? []) {
  insert(
    'work',
    e.role ?? e.company ?? '未命名职位',
    {
      company: e.company,
      role: e.role,
      period: e.period,
      highlights: e.highlights,
    },
    `work|${(e.company ?? '').trim()}|${(e.role ?? '').trim()}`,
  )
}

console.log('— 教育经历 —')
for (const e of r.education ?? []) {
  insert(
    'edu',
    e.school ?? '未命名学校',
    {
      school: e.school,
      major: e.major,
      degree: e.degree,
      period: e.period,
    },
    `edu|${(e.school ?? '').trim()}|${(e.major ?? '').trim()}`,
  )
}

console.log('— 基本信息（单条 profile）—')
const profileKey = 'profile|姓名'
if (r.name?.trim()) {
  if (existing.has(profileKey)) {
    console.log('  - 跳过（已存在）：姓名')
  } else {
    insert('profile', r.name, {
      title: r.title,
      city: r.city,
      phone: r.phone,
      email: r.email,
      summary: r.summary,
      skills: r.skills,
    })
  }
} else {
  console.log('  - 跳过：简历未填姓名')
}

console.log(`\n迁移完成：新增 ${inserted} 条（工作/教育/基本信息，项目经历未迁移）`)
