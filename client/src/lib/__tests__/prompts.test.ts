import { describe, it, expect } from 'vitest'
import {
  buildComposeResumePrompt,
  buildDiagnosePrompt,
  buildGreetingPrompt,
  buildMatchPrompt,
  buildPickProjectsPrompt,
  buildResumeExtractPrompt,
  buildStarPrompt,
  experiencesToText,
  resumeToText,
} from '../prompts'
import { emptyResume } from '../storage'

function sampleResume() {
  return {
    ...emptyResume(),
    name: '张三',
    title: '前端开发工程师',
    city: '上海',
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

describe('resumeToText', () => {
  it('包含各区块内容', () => {
    const text = resumeToText(sampleResume())
    expect(text).toContain('张三')
    expect(text).toContain('React、TypeScript')
    expect(text).toContain('A公司')
    expect(text).toContain('电商后台')
    expect(text).toContain('某大学')
  })
})

describe('buildDiagnosePrompt', () => {
  it('包含简历并要求 JSON 输出', () => {
    const { system, user } = buildDiagnosePrompt(sampleResume())
    expect(system).toContain('HR')
    expect(user).toContain('张三')
    expect(user).toContain('highlights')
    expect(user).toContain('JSON')
  })
})

describe('buildStarPrompt', () => {
  it('要求保持要点数量并包含 STAR', () => {
    const { user } = buildStarPrompt(sampleResume(), { name: '电商后台', description: '后台', points: ['a', 'b'] })
    expect(user).toContain('STAR')
    expect(user).toContain('points')
  })
})

describe('buildMatchPrompt', () => {
  it('包含简历、JD 与输出结构', () => {
    const { user } = buildMatchPrompt(sampleResume(), '需要 React 开发 3 年以上')
    expect(user).toContain('张三')
    expect(user).toContain('React 开发 3 年以上')
    expect(user).toContain('fitLevel')
    expect(user).toContain('reject')
  })
})

describe('buildGreetingPrompt', () => {
  it('包含岗位信息并限制字数', () => {
    const { user } = buildGreetingPrompt(sampleResume(), {
      company: 'B公司',
      title: '高级前端',
      city: '杭州',
      salary: '30-50K',
      jd: '要求 React 精通',
    })
    expect(user).toContain('B公司')
    expect(user).toContain('高级前端')
    expect(user).toContain('60 字')
  })
})

describe('buildResumeExtractPrompt', () => {
  it('要求输出结构化 JSON 并包含原文', () => {
    const { user } = buildResumeExtractPrompt('张三 前端 5年')
    expect(user).toContain('张三 前端 5年')
    expect(user).toContain('experiences')
    expect(user).toContain('JSON')
  })
})

describe('experiencesToText', () => {
  const items = [
    { id: 1, company: '路特', name: 'EDI 对接', role: '项目经理', period: '2025', description: '供应链自动化', points: ['对接 5 家 KA 客户'], tags: ['供应链', 'EDI'] },
  ]
  it('序列化出完整条目含 id', () => {
    const text = experiencesToText(items)
    expect(text).toContain('[id=1]')
    expect(text).toContain('EDI 对接')
    expect(text).toContain('供应链、EDI')
  })
})

describe('buildPickProjectsPrompt / buildComposeResumePrompt', () => {
  const items = [{ id: 1, company: '路特', name: 'EDI 对接', role: '项目经理', period: '2025', description: '供应链自动化', points: ['对接 5 家 KA 客户'], tags: ['供应链'] }]
  it('挑选提示词包含 JD 与经历库', () => {
    const { system, user } = buildPickProjectsPrompt('需要供应链经验', items, sampleResume())
    expect(system).toContain('2-4 个项目')
    expect(user).toContain('需要供应链经验')
    expect(user).toContain('[id=1]')
  })
  it('组装提示词只包含选中项目且含基础信息', () => {
    const { system, user } = buildComposeResumePrompt('需要供应链经验', [{ id: 1, reason: '匹配' }], items, sampleResume())
    expect(system).toContain('针对性简历')
    expect(user).toContain('EDI 对接')
    expect(user).toContain('张三')
  })
})
