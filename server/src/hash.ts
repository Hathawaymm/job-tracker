import { createHash } from 'crypto'

/** URL 归一化去重哈希（去协议/尾斜杠后取 sha1 前 16 位） */
export function urlHash(url: string): string {
  const norm = url.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  return createHash('sha1').update(norm).digest('hex').slice(0, 16)
}
