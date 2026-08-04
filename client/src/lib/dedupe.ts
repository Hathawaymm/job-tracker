import type { Job } from '../types'

export interface JobIdentity {
  company: string
  title: string
  url?: string
}

/** 公司名归一化：转小写、去空白、去掉常见公司后缀 */
export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/\(中国\)/g, '')
    .replace(/(股份有限公司|有限责任公司|有限公司|责任公司)$/g, '')
    .replace(/集团$/g, '')
    .replace(/科技$/g, '')
}

/** 职位名归一化：转小写、去空白、去掉括号内描述（如「（外包）」「（14薪）」） */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[（(][^（）()]*[）)]/g, '')
}

/** URL 归一化：去协议、去末尾斜杠、转小写 */
export function normalizeUrl(url: string): string {
  return url.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase()
}

/**
 * 判断目标岗位是否与已有岗位重复。
 * 命中任一规则即视为重复：① URL 相同 ② 公司名 + 职位名归一化后均相同。
 */
export function findDuplicateJob(jobs: Job[], target: JobIdentity): Job | null {
  const targetUrl = target.url ? normalizeUrl(target.url) : ''
  const targetCompany = normalizeCompany(target.company)
  const targetTitle = normalizeTitle(target.title)

  for (const job of jobs) {
    if (targetUrl && job.url && normalizeUrl(job.url) === targetUrl) return job
    if (targetCompany && targetTitle && normalizeCompany(job.company) === targetCompany && normalizeTitle(job.title) === targetTitle) {
      return job
    }
  }
  return null
}
