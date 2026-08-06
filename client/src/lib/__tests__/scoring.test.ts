import { describe, it, expect } from 'vitest'
import {
  extractJson,
  mergeExtractedResume,
  parseDiagnoseResult,
  parseMatchResult,
  parsePickProjectsResult,
  parseResumeExtract,
  parseStarResult,
} from '../scoring'
import { emptyResume } from '../storage'

describe('extractJson', () => {
  it('解析纯 JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('容忍 markdown 代码块', () => {
    const text = '结果如下：\n```json\n{"score":80}\n```\n完毕'
    expect(extractJson(text)).toEqual({ score: 80 })
  })

  it('容忍前后废话与尾逗号', () => {
    const text = '好的，给你：{ "points": ["a", "b",], } 请查收'
    expect(extractJson(text)).toEqual({ points: ['a', 'b'] })
  })

  it('无法解析时返回 null', () => {
    expect(extractJson('没有JSON内容')).toBeNull()
  })
})

describe('parseMatchResult', () => {
  it('解析正常结果', () => {
    const r = parseMatchResult('{"score":85,"fitLevel":"high","reason":"技术栈匹配","suggestion":"速投"}')
    expect(r).toEqual({ score: 85, fitLevel: 'high', reason: '技术栈匹配', suggestion: '速投' })
  })

  it('score 越界时夹取到 0-100', () => {
    expect(parseMatchResult('{"score":150}').score).toBe(100)
    expect(parseMatchResult('{"score":-5}').score).toBe(0)
  })

  it('fitLevel 非法时降级为 low', () => {
    expect(parseMatchResult('{"fitLevel":"excellent"}').fitLevel).toBe('low')
  })

  it('无法解析时返回默认值', () => {
    expect(parseMatchResult('随便')).toEqual({ score: 0, fitLevel: 'low', reason: '', suggestion: '' })
  })
})

describe('parseDiagnoseResult / parseStarResult', () => {
  it('解析诊断结果并过滤非字符串', () => {
    const r = parseDiagnoseResult('{"highlights":["A","B"],"weaknesses":["C"],"suggestions":[1,"D"]}')
    expect(r.highlights).toEqual(['A', 'B'])
    expect(r.weaknesses).toEqual(['C'])
    expect(r.suggestions).toEqual(['D'])
  })

  it('STAR 解析要点数组', () => {
    expect(parseStarResult('{"points":["x","y"]}').points).toEqual(['x', 'y'])
    expect(parseStarResult('{}').points).toEqual([])
  })
})

describe('parseResumeExtract / mergeExtractedResume', () => {
  it('解析提取结果', () => {
    const ext = parseResumeExtract(
      '{"name":"张三","skills":["React","TS"],"experiences":[{"company":"A","role":"前端","period":"2020-至今","highlights":["优化性能"]}],"education":[{"school":"某大学"}]}',
    )
    expect(ext.name).toBe('张三')
    expect(ext.skills).toEqual(['React', 'TS'])
    expect(ext.experiences?.[0].company).toBe('A')
  })

  it('空输入返回空对象', () => {
    expect(parseResumeExtract('')).toEqual({})
  })

  it('合并到现有简历并补 id', () => {
    const current = emptyResume()
    current.name = '原姓名'
    current.skills = ['旧技能']
    const merged = mergeExtractedResume(current, {
      name: '新姓名',
      experiences: [{ company: 'A', role: '前端', period: '', highlights: [] }],
    })
    expect(merged.name).toBe('新姓名')
    expect(merged.skills).toEqual(['旧技能'])
    expect(merged.experiences).toHaveLength(1)
    expect(merged.experiences[0].id.length).toBeGreaterThan(0)
    expect(merged.experiences[0].company).toBe('A')
    expect(merged.projects).toEqual([])
  })
})

describe('parsePickProjectsResult', () => {
  it('解析选中项目与 summary', () => {
    const r = parsePickProjectsResult('{"selected":[{"id":3,"reason":"匹配供应链"}],"summary":"概述"}')
    expect(r.selected).toEqual([{ id: 3, reason: '匹配供应链' }])
    expect(r.summary).toBe('概述')
  })
  it('容忍代码块与尾逗号，过滤非法 id', () => {
    const r = parsePickProjectsResult('```json\n{"selected":[{"id":1,"reason":"a"},{"id":"abc","reason":"b"}],}\n```')
    expect(r.selected).toEqual([{ id: 1, reason: 'a' }])
  })
  it('非 JSON 返回空结果', () => {
    const r = parsePickProjectsResult('抱歉，无法处理')
    expect(r.selected).toEqual([])
    expect(r.summary).toBe('')
  })
})
