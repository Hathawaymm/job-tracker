import { describe, it, expect } from 'vitest'
import { cityMatch, hardFilter, parseExpectedMinK, parseSalaryK, salaryPasses } from '../filter.js'

describe('parseSalaryK', () => {
  it('解析 K 单位区间', () => {
    expect(parseSalaryK('20-30K')).toEqual({ min: 20, max: 30 })
    expect(parseSalaryK('20k-30k·14薪')).toEqual({ min: 20, max: 30 })
  })

  it('解析万单位', () => {
    expect(parseSalaryK('1.5万-2万')).toEqual({ min: 15, max: 20 })
  })

  it('无法解析（面议）返回 null', () => {
    expect(parseSalaryK('面议')).toEqual({ min: null, max: null })
    expect(parseSalaryK('薪资面谈')).toEqual({ min: null, max: null })
  })
})

describe('cityMatch', () => {
  it('精确匹配', () => {
    expect(cityMatch('上海', '上海')).toBe(true)
  })

  it('期望多城市任一匹配', () => {
    expect(cityMatch('上海', '北京、上海')).toBe(true)
    expect(cityMatch('成都', '北京、上海')).toBe(false)
  })

  it('不限/全国视为匹配', () => {
    expect(cityMatch('不限', '上海')).toBe(true)
    expect(cityMatch('全国', '上海')).toBe(true)
  })

  it('期望城市为空视为匹配', () => {
    expect(cityMatch('上海', '')).toBe(true)
  })

  it('岗位城市缺失视为不匹配', () => {
    expect(cityMatch('', '上海')).toBe(false)
  })
})

describe('salaryPasses / parseExpectedMinK', () => {
  it('岗位下限 ≥ 期望下限通过', () => {
    expect(salaryPasses('20-30K', 15)).toBe(true)
  })

  it('岗位下限 < 期望下限剔除', () => {
    expect(salaryPasses('10-15K', 15)).toBe(false)
  })

  it('面议薪资放行', () => {
    expect(salaryPasses('面议', 20)).toBe(true)
  })

  it('解析用户期望薪资下限', () => {
    expect(parseExpectedMinK('20k-30k')).toBe(20)
    expect(parseExpectedMinK('')).toBe(null)
  })
})

describe('hardFilter', () => {
  it('城市不符被剔除', () => {
    const r = hardFilter({ city: '北京', salary: '20-30K' }, '上海', 15)
    expect(r.passed).toBe(false)
    expect(r.reason).toContain('城市')
  })

  it('薪资过低被剔除', () => {
    const r = hardFilter({ city: '上海', salary: '8-12K' }, '上海', 15)
    expect(r.passed).toBe(false)
    expect(r.reason).toContain('薪资')
  })

  it('城市薪资都通过', () => {
    expect(hardFilter({ city: '上海', salary: '20-30K' }, '上海', 15).passed).toBe(true)
  })
})
