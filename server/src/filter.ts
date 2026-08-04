// ---------------------------------------------------------------------------
// 硬性过滤（纯函数，可单测）：城市匹配 + 薪资下限
// ---------------------------------------------------------------------------

export interface HardFilterResult {
  passed: boolean
  reason: string
}

/** 解析薪资文本为 K 为单位的下限/上限（返回 null 表示无法解析，如「面议」） */
export function parseSalaryK(salary: string): { min: number | null; max: number | null } {
  const cleaned = salary.replace(/[，。]/g, ',').replace(/\d+(?:\.\d+)?薪/gi, '')
  const nums = cleaned.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? []
  if (nums.length === 0) return { min: null, max: null }
  const unit = /w|万/i.test(cleaned) ? 10 : /k/i.test(cleaned) ? 1 : 1
  const min = nums[0] * unit
  const max = nums.length > 1 ? nums[nums.length - 1] * unit : min
  return { min, max }
}

/** 城市匹配：期望城市支持「A、B」多选；岗位城市为「不限/全国/多地」视为通过；期望为空视为通过 */
export function cityMatch(city: string, expected: string): boolean {
  if (!expected.trim()) return true
  const jobCity = city.trim()
  if (!jobCity) return false
  if (/不限|全国|多地|异地/.test(jobCity)) return true
  const expects = expected
    .split(/[、，,\s/]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return expects.some((e) => jobCity.includes(e) || e.includes(jobCity))
}

/** 薪资下限校验：岗位薪资下限低于用户期望下限则剔除；无法解析薪资（面议）放行 */
export function salaryPasses(salary: string, expectedMinK: number | null): boolean {
  if (expectedMinK === null || expectedMinK <= 0) return true
  const { min } = parseSalaryK(salary)
  if (min === null) return true
  return min >= expectedMinK
}

/** 解析用户期望薪资（如「20k-30k」「15-25K」）为下限 K 数，解析失败返回 null */
export function parseExpectedMinK(salaryText: string): number | null {
  const { min } = parseSalaryK(salaryText)
  return min
}

export function hardFilter(job: { city: string; salary: string }, expectedCity: string, expectedMinK: number | null): HardFilterResult {
  if (!cityMatch(job.city, expectedCity)) {
    return { passed: false, reason: `城市不符（岗位：${job.city || '未知'}，期望：${expectedCity || '不限'}）` }
  }
  if (!salaryPasses(job.salary, expectedMinK)) {
    const { min } = parseSalaryK(job.salary)
    return { passed: false, reason: `薪资下限过低（${job.salary || '未知'} < ${expectedMinK}K）${min === null ? '' : `，下限约 ${min}K`}` }
  }
  return { passed: true, reason: '通过硬性过滤' }
}
