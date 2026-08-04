import { describe, it, expect } from 'vitest'
import { emptyResume, exportJson, makeJob, makeResumeVersion, parseImportJson } from '../storage'

describe('makeJob', () => {
  it('生成默认字段', () => {
    const j = makeJob({ company: 'A', title: '前端' })
    expect(j.id.length).toBeGreaterThan(0)
    expect(j.channel).toBe('BOSS直聘')
    expect(j.status).toBe('applied')
    expect(j.confirmed).toBe(false)
    expect(j.match).toBeNull()
    expect(j.greeting).toBeNull()
    expect(j.submittedAt).toBeNull()
    expect(j.source).toBe('manual')
    expect(j.createdAt).toBeTruthy()
  })
})

describe('makeResumeVersion', () => {
  it('生成版本基础字段', () => {
    const v = makeResumeVersion('通用版', emptyResume())
    expect(v.id.length).toBeGreaterThan(0)
    expect(v.name).toBe('通用版')
    expect(v.createdAt).toBeTruthy()
  })
})

describe('exportJson / parseImportJson', () => {
  const data = {
    resumes: [makeResumeVersion('通用版', { ...emptyResume(), name: '张三', title: '前端' })],
    jobs: [makeJob({ company: 'A', title: '前端' })],
    interviews: [],
    logs: [],
  }

  it('导出再导入可还原（新版 resumes）', () => {
    const text = exportJson(data)
    const parsed = parseImportJson(text)
    expect(parsed).not.toBeNull()
    expect(parsed?.jobs).toHaveLength(1)
    expect(parsed?.resumes).toHaveLength(1)
    expect(parsed?.resumes[0].name).toBe('通用版')
    expect(parsed?.resumes[0].resume.name).toBe('张三')
  })

  it('兼容旧版单份 resume 导入', () => {
    const old = JSON.stringify({
      resume: { ...emptyResume(), name: '李四' },
      jobs: [],
      interviews: [],
      logs: [],
    })
    const parsed = parseImportJson(old)
    expect(parsed?.resumes).toHaveLength(1)
    expect(parsed?.resumes[0].resume.name).toBe('李四')
  })

  it('直接导入 jobs 数组格式（旧版兼容）', () => {
    const parsed = parseImportJson(JSON.stringify({ jobs: [makeJob({ company: 'B' })] }))
    expect(parsed?.jobs).toHaveLength(1)
    expect(parsed?.resumes).toHaveLength(1)
  })

  it('无效内容返回 null', () => {
    expect(parseImportJson('not json')).toBeNull()
    expect(parseImportJson('{"foo": 1}')).toBeNull()
  })
})
