import { createHash } from 'crypto'

/** URL 归一化去重哈希（去协议/尾斜杠后取 sha1 前 16 位） */
export function urlHash(url: string): string {
  const norm = url.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  return createHash('sha1').update(norm).digest('hex').slice(0, 16)
}

/** 文本归一化：去空白、去常见后缀（市/省/有限公司等），用于拼接唯一指纹时消除微小差异 */
export function normalizeText(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, '')
    .replace(/股份有限公司$/, '')
    .replace(/有限公司$/, '')
    .replace(/有限责任公司$/, '')
    .replace(/市$/, '')
    .replace(/省$/, '')
}

/** 岗位唯一指纹：external_id（招聘站 job id）优先；空则用归一化的 公司|标题|城市 拼接后 sha1 */
export function uniqueKey(platform: string, externalId: string | null | undefined, company: string, title: string, city: string): string {
  if (externalId && externalId.trim()) return `${platform}:${externalId.trim()}`
  const raw = [normalizeText(company), normalizeText(title), normalizeText(city)].filter(Boolean).join('|')
  return `${platform}:${createHash('sha1').update(raw || 'no-meta').digest('hex').slice(0, 16)}`
}
