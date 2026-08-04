import { getCredentials } from './keys.js'

export interface MatchOutcome {
  score: number
  reason: string
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0]) as Record<string, unknown>
  } catch {
    return null
  }
}

/** 用 DeepSeek 对「岗位 JD + 简历」做匹配度评分（0-100）并给出理由 */
export async function aiMatchScore(jd: string, resumeText: string): Promise<MatchOutcome> {
  const creds = getCredentials()
  if (!creds.deepseek) throw new Error('未配置 DeepSeek key（auth.json deepseek provider）')

  const body = {
    model: 'deepseek-v4-flash',
    messages: [
      {
        role: 'system',
        content:
          '你是严格的求职匹配顾问。仅输出一个 JSON 对象 {"score": number, "reason": string}，不要输出任何其他内容。score 为 0-100 的匹配度整数；reason 用一句简体中文说明最关键的匹配点或明显差距。',
      },
      {
        role: 'user',
        content: `岗位 JD："""${jd.slice(0, 4000)}"""\n\n候选人简历："""${resumeText.slice(0, 6000)}"""`,
      },
    ],
    thinking: { type: 'disabled' },
    max_tokens: 300,
    stream: false,
  }

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.deepseek}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DeepSeek 评分失败（HTTP ${res.status}）: ${text.slice(0, 200)}`)
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content ?? ''
  const obj = extractJsonObject(content)
  if (!obj) return { score: 0, reason: '评分结果解析失败' }

  const scoreRaw = Number(obj.score)
  const score = Number.isFinite(scoreRaw) ? Math.min(100, Math.max(0, Math.round(scoreRaw))) : 0
  const reason = typeof obj.reason === 'string' ? obj.reason : ''
  return { score, reason }
}
