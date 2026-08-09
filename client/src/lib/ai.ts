import type { Resume, Job } from '../types'
import {
  buildComposeResumePrompt,
  buildDiagnosePrompt,
  buildGenerateResumeFromBankPrompt,
  buildGreetingPrompt,
  buildInterviewSystemPrompt,
  buildMatchPrompt,
  buildOptimizePrompt,
  buildPickProjectsPrompt,
  buildResumeExtractPrompt,
  buildStarPrompt,
  type ExperienceBankItem,
} from './prompts'
import {
  parseDiagnoseResult,
  parseMatchResult,
  parsePickProjectsResult,
  parseResumeExtract,
  parseStarResult,
  type DiagnoseResult,
  type ExtractedResume,
  type MatchPayload,
  type PickProjectsResult,
} from './scoring'

export interface ChatOptions {
  thinking?: 'on' | 'off'
  effort?: 'low' | 'high' | 'max'
  maxTokens?: number
}

export class AiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiError'
  }
}

/** 非流式文本对话（DeepSeek V4 Flash，经本地代理） */
export async function chat(messages: Array<{ role: string; content: string }>, options: ChatOptions = {}): Promise<string> {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, stream: false, ...options }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new AiError(body?.error ?? `AI 请求失败（HTTP ${res.status}）`)
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: unknown }
  if (data.error) throw new AiError(JSON.stringify(data.error))
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new AiError('AI 未返回内容')
  return content
}

/** 流式文本对话（SSE），onChunk 逐段接收增量文本 */
export async function streamChat(
  messages: Array<{ role: string; content: string }>,
  options: ChatOptions,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, stream: true, ...options }),
  })
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new AiError(body?.error ?? `AI 流式请求失败（HTTP ${res.status}）`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const obj = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> }
        const delta = obj.choices?.[0]?.delta?.content
        if (delta) {
          full += delta
          onChunk(delta)
        }
      } catch {
        // 忽略无法解析的 SSE 块
      }
    }
  }
  return full
}

// ---- 业务封装 ----

/** AI 简历诊断 */
export async function diagnoseResume(resume: Resume): Promise<DiagnoseResult> {
  const { system, user } = buildDiagnosePrompt(resume)
  const text = await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { thinking: 'on', effort: 'low', maxTokens: 2000 },
  )
  return parseDiagnoseResult(text)
}

/** 基于诊断结果整份优化简历，返回优化后的结构化字段 */
export async function optimizeResume(
  resume: Resume,
  diagnose: DiagnoseResult,
): Promise<ExtractedResume> {
  const { system, user } = buildOptimizePrompt(resume, diagnose)
  const text = await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { thinking: 'on', effort: 'low', maxTokens: 4000 },
  )
  return parseResumeExtract(text)
}

/** STAR 润色：项目要点改写 */
export async function starPolish(
  resume: Resume,
  target: { name: string; description: string; points: string[] },
): Promise<string[]> {
  const { system, user } = buildStarPrompt(resume, target)
  const text = await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { thinking: 'off', maxTokens: 1500 },
  )
  return parseStarResult(text).points
}

/** AI 岗位匹配筛选 */
export async function matchJob(
  resume: Resume,
  jobText: string,
  targetIndustries: string[] = [],
): Promise<MatchPayload> {
  const { system, user } = buildMatchPrompt(resume, jobText, targetIndustries)
  const text = await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { thinking: 'off', maxTokens: 1200 },
  )
  return parseMatchResult(text)
}

/** 千岗千面招呼语生成 */
export async function generateGreeting(resume: Resume, job: Job): Promise<string> {
  const { system, user } = buildGreetingPrompt(resume, {
    company: job.company,
    title: job.title,
    city: job.city,
    salary: job.salary,
    jd: job.jdText,
  })
  const text = await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { thinking: 'off', maxTokens: 300 },
  )
  return text.trim()
}

/** 模拟面试：基于简历的流式面试官对话 */
export function interviewSystemPrompt(resume: Resume): string {
  return buildInterviewSystemPrompt(resume)
}

/** 识图（GLM-4.6V）：返回图片描述文本 */
export async function visionDescribe(dataUri: string, prompt?: string): Promise<string> {
  const res = await fetch('/api/ai/vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUri: dataUri, prompt }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new AiError(body?.error ?? `识图失败（HTTP ${res.status}）`)
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new AiError('识图未返回内容')
  return content
}

/** 简历文字内容 → 结构化简历：由 DeepSeek 提取为结构化字段 */
export async function resumeFromText(sourceText: string): Promise<ExtractedResume> {
  const { system, user } = buildResumeExtractPrompt(sourceText)
  const text = await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    // 结构提取是机械转换，无需深度推理；thinking off 避免推理挤占输出预算导致空 content
    { thinking: 'off', maxTokens: 8000 },
  )
  return parseResumeExtract(text)
}

/** 简历图片 → 结构化简历：先识图转文字，再由 DeepSeek 提取为结构化字段 */
export async function resumeFromImage(dataUri: string): Promise<ExtractedResume> {
  const desc = await visionDescribe(
    dataUri,
    '请完整、准确地逐字提取这份简历图片中的所有文字，保留原有分段与要点结构，不要遗漏任何项目、工作、教育经历和数字。',
  )
  return resumeFromText(desc)
}

/** 从经历库挑选最匹配岗位的项目 */
export async function pickProjectsForJob(
  jobJd: string,
  items: ExperienceBankItem[],
  resume: Resume,
): Promise<PickProjectsResult> {
  const { system, user } = buildPickProjectsPrompt(jobJd, items, resume)
  const text = await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { thinking: 'off', maxTokens: 1500 },
  )
  return parsePickProjectsResult(text)
}

/** 用选中项目组装针对性简历，返回结构化字段 */
export async function composeResumeForJob(
  jobJd: string,
  picked: Array<{ id: number; reason: string }>,
  items: ExperienceBankItem[],
  resume: Resume,
): Promise<ExtractedResume> {
  const { system, user } = buildComposeResumePrompt(jobJd, picked, items, resume)
  const text = await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { thinking: 'on', effort: 'low', maxTokens: 4000 },
  )
  return parseResumeExtract(text)
}

/** 简历页「AI 生成简历」：全量经历库 + 当前简历 + JD。工作/教育/基础信息由 merge 时从当前简历继承 */
export async function generateResumeFromBank(
  jobJd: string,
  items: ExperienceBankItem[],
  resume: Resume,
): Promise<ExtractedResume> {
  const { system, user } = buildGenerateResumeFromBankPrompt(jobJd, items, resume)
  const text = await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { thinking: 'on', effort: 'low', maxTokens: 4000 },
  )
  return parseResumeExtract(text)
}

/** 服务健康检查：确认代理与 key 状态 */
export async function healthCheck(): Promise<{ deepseek: boolean; vision: boolean }> {
  const res = await fetch('/api/health')
  if (!res.ok) throw new AiError('本地 AI 代理不可用，请确认 server 已启动（npm run dev）')
  const data = (await res.json()) as { deepseek?: boolean; vision?: boolean }
  return { deepseek: data.deepseek ?? false, vision: data.vision ?? false }
}
