import { describe, it, expect } from 'vitest'
import { urlHash } from '../hash.js'

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
