// ---------------------------------------------------------------------------
// AI 返回文本的 JSON 容错解析 + 匹配结果类型守卫
// ---------------------------------------------------------------------------
import { uid } from './id'
import type { Resume } from '../types'

function stripCodeFence(text: string): string {
  const match = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  return match ? match[1] : text
}

/** 从 AI 返回文本中尽力提取一个 JSON 对象（容忍代码块、前后废话、尾逗号） */
export function extractJson(text: string): unknown | null {
  const candidates: string[] = []

  const cleaned = stripCodeFence(text).trim()
  if (cleaned.startsWith('{')) candidates.push(cleaned)

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start !== -1 && end > start) {
    candidates.push(cleaned.slice(start, end + 1))
  }

  for (const cand of candidates) {
    try {
      return JSON.parse(cand)
    } catch {
      const fixed = cand.replace(/,\s*([}\]])/g, '$1')
      try {
        return JSON.parse(fixed)
      } catch {
        // 继续尝试下一个候选
      }
    }
  }
  return null
}

export interface DiagnoseResult {
  highlights: string[]
  weaknesses: string[]
  suggestions: string[]
}

export interface StarResult {
  points: string[]
}

export interface MatchPayload {
  score: number
  fitLevel: 'high' | 'medium' | 'low' | 'reject'
  reason: string
  suggestion: string
}

function toStrArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean)
  }
  return []
}

function toStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback
}

export function parseDiagnoseResult(text: string): DiagnoseResult {
  const obj = extractJson(text)
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>
    return {
      highlights: toStrArray(o.highlights),
      weaknesses: toStrArray(o.weaknesses),
      suggestions: toStrArray(o.suggestions),
    }
  }
  return { highlights: [], weaknesses: [], suggestions: [] }
}

export function parseStarResult(text: string): StarResult {
  const obj = extractJson(text)
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>
    return { points: toStrArray(o.points) }
  }
  return { points: [] }
}

export function parseMatchResult(text: string): MatchPayload {
  const obj = extractJson(text)
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>
    const scoreRaw = Number(o.score)
    const score = Number.isFinite(scoreRaw) ? Math.min(100, Math.max(0, Math.round(scoreRaw))) : 0
    const fitLevel = ['high', 'medium', 'low', 'reject'].includes(toStr(o.fitLevel))
      ? (o.fitLevel as MatchPayload['fitLevel'])
      : 'low'
    return {
      score,
      fitLevel,
      reason: toStr(o.reason),
      suggestion: toStr(o.suggestion),
    }
  }
  return { score: 0, fitLevel: 'low', reason: '', suggestion: '' }
}

export interface ExtractedResume {
  name?: string
  title?: string
  city?: string
  phone?: string
  email?: string
  summary?: string
  skills?: string[]
  experiences?: Array<{ company?: string; role?: string; period?: string; highlights?: string[] }>
  projects?: Array<{ company?: string; name?: string; role?: string; description?: string; points?: string[] }>
  education?: Array<{ school?: string; major?: string; degree?: string; period?: string }>
}

/** 从 AI 提取文本解析出结构化的简历字段（容错；无 id 时补 uid） */
export function parseResumeExtract(text: string): ExtractedResume {
  const obj = extractJson(text)
  if (!obj || typeof obj !== 'object') return {}
  const o = obj as Record<string, unknown>
  return {
    name: toStr(o.name) || undefined,
    title: toStr(o.title) || undefined,
    city: toStr(o.city) || undefined,
    phone: toStr(o.phone) || undefined,
    email: toStr(o.email) || undefined,
    summary: toStr(o.summary) || undefined,
    skills: o.skills ? toStrArray(o.skills) : undefined,
    experiences: Array.isArray(o.experiences)
      ? (o.experiences as Array<Record<string, unknown>>).map((e) => ({
          company: toStr(e.company),
          role: toStr(e.role),
          period: toStr(e.period),
          highlights: toStrArray(e.highlights),
        }))
      : undefined,
    projects: Array.isArray(o.projects)
      ? (o.projects as Array<Record<string, unknown>>).map((p) => ({
          company: toStr(p.company),
          name: toStr(p.name),
          role: toStr(p.role),
          description: toStr(p.description),
          points: toStrArray(p.points),
        }))
      : undefined,
    education: Array.isArray(o.education)
      ? (o.education as Array<Record<string, unknown>>).map((ed) => ({
          school: toStr(ed.school),
          major: toStr(ed.major),
          degree: toStr(ed.degree),
          period: toStr(ed.period),
        }))
      : undefined,
  }
}

/** 把提取结果合并进现有简历（只覆盖非空字段，保持未填内容） */
export function mergeExtractedResume(current: Resume, ext: ExtractedResume): Resume {
  return {
    ...current,
    ...(ext.name !== undefined ? { name: ext.name } : {}),
    ...(ext.title !== undefined ? { title: ext.title } : {}),
    ...(ext.city !== undefined ? { city: ext.city } : {}),
    ...(ext.phone !== undefined ? { phone: ext.phone } : {}),
    ...(ext.email !== undefined ? { email: ext.email } : {}),
    ...(ext.summary !== undefined ? { summary: ext.summary } : {}),
    skills: ext.skills !== undefined ? ext.skills : current.skills,
    experiences:
      ext.experiences !== undefined
        ? ext.experiences.map((e) => ({
            id: uid(),
            company: e.company ?? '',
            role: e.role ?? '',
            period: e.period ?? '',
            highlights: e.highlights ?? [],
          }))
        : current.experiences,
    projects:
      ext.projects !== undefined
        ? ext.projects.map((p) => ({
            id: uid(),
            company: p.company ?? '',
            name: p.name ?? '',
            role: p.role ?? '',
            description: p.description ?? '',
            points: p.points ?? [],
          }))
        : current.projects,
    education:
      ext.education !== undefined
        ? ext.education.map((e) => ({
            id: uid(),
            school: e.school ?? '',
            major: e.major ?? '',
            degree: e.degree ?? '',
            period: e.period ?? '',
          }))
        : current.education,
  }
}
