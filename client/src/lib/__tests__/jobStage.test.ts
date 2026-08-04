import { describe, it, expect } from 'vitest'
import { jobStage } from '../jobStage'
import { makeJob } from '../storage'

function stageJob(patch: Record<string, unknown>) {
  return makeJob(patch as never)
}

describe('jobStage', () => {
  it('未确认 = new', () => {
    expect(jobStage(stageJob({ confirmed: false }))).toBe('new')
  })

  it('已确认无话术 = confirmed', () => {
    expect(jobStage(stageJob({ confirmed: true }))).toBe('confirmed')
  })

  it('已确认且已有话术 = greeted', () => {
    expect(jobStage(stageJob({ confirmed: true, greeting: { text: 'hi', model: 'm', createdAt: 'x' } }))).toBe('greeted')
  })

  it('已投递且状态为进行中 = submitted', () => {
    expect(jobStage(stageJob({ confirmed: true, greeting: { text: 'hi', model: 'm', createdAt: 'x' }, submittedAt: '2026-01-01' }))).toBe('submitted')
  })

  it('已投递且进入面试/筛选 = active', () => {
    expect(jobStage(stageJob({ submittedAt: '2026-01-01', status: 'interview' }))).toBe('active')
    expect(jobStage(stageJob({ submittedAt: '2026-01-01', status: 'screening' }))).toBe('active')
  })

  it('offer/rejected/withdrawn = closed', () => {
    expect(jobStage(stageJob({ status: 'offer' }))).toBe('closed')
    expect(jobStage(stageJob({ status: 'rejected' }))).toBe('closed')
    expect(jobStage(stageJob({ status: 'withdrawn' }))).toBe('closed')
  })
})
