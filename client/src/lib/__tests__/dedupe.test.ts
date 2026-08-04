import { describe, it, expect } from 'vitest'
import { findDuplicateJob, normalizeCompany, normalizeTitle, normalizeUrl } from '../dedupe'
import { makeJob } from '../storage'

function job(partial: Record<string, string | undefined>) {
  return makeJob({
    company: partial.company ?? '',
    title: partial.title ?? '',
    url: partial.url ?? '',
  })
}

describe('normalizeCompany', () => {
  it('去除空格并转小写', () => {
    expect(normalizeCompany('  ByteDance  ')).toBe('bytedance')
  })

  it('去除常见公司后缀', () => {
    expect(normalizeCompany('深圳市腾讯计算机系统有限公司')).toBe('深圳市腾讯计算机系统')
    expect(normalizeCompany('字节跳动股份有限公司')).toBe('字节跳动')
    expect(normalizeCompany('小红书科技有限公司')).toBe('小红书')
    expect(normalizeCompany('某集团')).toBe('某')
  })

  it('去除（中国）字样', () => {
    expect(normalizeCompany('阿里巴巴(中国)网络技术有限公司')).toBe('阿里巴巴网络技术')
  })
})

describe('normalizeTitle', () => {
  it('去空白与小写', () => {
    expect(normalizeTitle(' 前端开发工程师 ')).toBe('前端开发工程师')
  })

  it('去掉括号内描述', () => {
    expect(normalizeTitle('前端开发工程师（外包）')).toBe('前端开发工程师')
    expect(normalizeTitle('Java 开发（14薪）')).toBe('java开发')
  })
})

describe('normalizeUrl', () => {
  it('去协议与末尾斜杠', () => {
    expect(normalizeUrl('https://www.zhipin.com/job/abc/')).toBe('www.zhipin.com/job/abc')
  })
})

describe('findDuplicateJob', () => {
  it('按 URL 去重', () => {
    const jobs = [job({ company: 'A', title: '前端', url: 'https://x.com/job/1' })]
    const dup = findDuplicateJob(jobs, { company: 'B', title: '后端', url: 'https://x.com/job/1/' })
    expect(dup).not.toBeNull()
    expect(dup?.company).toBe('A')
  })

  it('按公司+职位归一化去重（忽略后缀差异）', () => {
    const jobs = [job({ company: '字节跳动有限公司', title: '前端开发工程师' })]
    const dup = findDuplicateJob(jobs, { company: '字节跳动', title: '前端开发工程师' })
    expect(dup).not.toBeNull()
  })

  it('不同岗位不误判', () => {
    const jobs = [job({ company: '字节跳动', title: '前端开发工程师' })]
    expect(findDuplicateJob(jobs, { company: '字节跳动', title: '后端开发工程师' })).toBeNull()
    expect(findDuplicateJob(jobs, { company: '腾讯', title: '前端开发工程师' })).toBeNull()
  })

  it('空 job 列表返回 null', () => {
    expect(findDuplicateJob([], { company: 'A', title: 'B' })).toBeNull()
  })
})
