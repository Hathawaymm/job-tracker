import { describe, it, expect } from 'vitest'
import { normalizeText, uniqueKey, urlHash } from '../hash.js'

describe('urlHash', () => {
  it('相同 URL 归一化后哈希一致', () => {
    expect(urlHash('https://www.zhipin.com/job/abc.html')).toBe(urlHash('http://www.zhipin.com/job/abc.html/'))
  })

  it('不同 URL 哈希不同', () => {
    expect(urlHash('https://www.zhipin.com/job/abc.html')).not.toBe(urlHash('https://www.zhipin.com/job/def.html'))
  })

  it('固定长度 16 位', () => {
    expect(urlHash('https://x.com/job/1')).toHaveLength(16)
  })
})

describe('uniqueKey', () => {
  it('有 external_id 时直接用 job id（同一岗位不同文本也同 key）', () => {
    expect(uniqueKey('liepin', '1984041913', 'A公司', '标题A', '深圳')).toBe('liepin:1984041913')
    expect(uniqueKey('liepin', '1984041913', 'B公司', '标题B', '北京')).toBe('liepin:1984041913')
  })

  it('无 external_id 时用归一化拼接（北京市/北京、去有限公司后缀）', () => {
    expect(uniqueKey('liepin', null, '北京某某科技有限公司', '项目经理', '北京市')).toBe(
      uniqueKey('liepin', null, '北京某某科技', '项目经理', '北京'),
    )
  })

  it('不同岗位（无 id）哈希不同', () => {
    expect(uniqueKey('liepin', null, 'A公司', '标题A', '深圳')).not.toBe(
      uniqueKey('liepin', null, 'B公司', '标题B', '北京'),
    )
  })

  it('不同平台同 id 视为不同岗位', () => {
    expect(uniqueKey('liepin', '123', 'A', 'B', '')).not.toBe(uniqueKey('boss', '123', 'A', 'B', ''))
  })
})

describe('normalizeText', () => {
  it('去除空白与常见后缀', () => {
    expect(normalizeText(' 北京某某科技有限公司 ')).toBe('北京某某科技')
    expect(normalizeText('北京市')).toBe('北京')
  })
})
