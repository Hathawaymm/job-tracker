import { describe, it, expect } from 'vitest'
import { resumeToMarkdown } from '../exportDoc'
import { emptyResume } from '../storage'

function sampleResume() {
  return {
    ...emptyResume(),
    name: '张三',
    title: '前端开发工程师',
    city: '上海',
    phone: '13800000000',
    email: 'zhang@example.com',
    summary: '5 年前端经验',
    skills: ['React', 'TypeScript'],
    experiences: [
      { id: 'e1', company: 'A公司', role: '前端', period: '2020-2023', highlights: ['负责核心模块，性能提升 30%'] },
    ],
    projects: [
      { id: 'p1', company: 'A公司', name: '电商后台', role: '主力开发', description: '后台管理系统', points: ['实现权限系统'] },
    ],
    education: [{ id: 'ed1', school: '某大学', major: '计算机', degree: '本科', period: '2016-2020' }],
  }
}

describe('resumeToMarkdown', () => {
  it('包含各区块标题与内容', () => {
    const md = resumeToMarkdown(sampleResume())
    expect(md).toContain('# 张三')
    expect(md).toContain('前端开发工程师')
    expect(md).toContain('## 个人简介')
    expect(md).toContain('## 技能')
    expect(md).toContain('## 工作经历')
    expect(md).toContain('## 项目经历')
    expect(md).toContain('## 教育经历')
    expect(md).toContain('A公司')
    expect(md).toContain('电商后台')
    expect(md).toContain('某大学')
  })

  it('空简历不报错', () => {
    const md = resumeToMarkdown(emptyResume())
    expect(md).toContain('# 未命名')
  })

  it('要点以列表呈现', () => {
    const md = resumeToMarkdown(sampleResume())
    expect(md).toContain('- 负责核心模块，性能提升 30%')
    expect(md).toContain('- 实现权限系统')
  })
})
