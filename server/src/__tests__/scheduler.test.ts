import { describe, it, expect } from 'vitest'
import { generateTodayWindows, randomTimeInWindow, todayStr } from '../scheduler.js'

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

describe('scheduler 窗口', () => {
  it('随机时刻落在窗口内', () => {
    for (let i = 0; i < 50; i++) {
      const t = randomTimeInWindow({ label: 'morning', start: '08:00', end: '09:00' })
      const m = timeToMin(t)
      expect(m).toBeGreaterThanOrEqual(8 * 60)
      expect(m).toBeLessThan(9 * 60)
    }
  })

  it('中午窗口 12-14 随机时刻', () => {
    for (let i = 0; i < 30; i++) {
      const t = randomTimeInWindow({ label: 'noon', start: '12:00', end: '14:00' })
      const m = timeToMin(t)
      expect(m).toBeGreaterThanOrEqual(12 * 60)
      expect(m).toBeLessThan(14 * 60)
    }
  })

  it('生成每日 3 个窗口', () => {
    const ws = generateTodayWindows()
    expect(ws).toHaveLength(3)
    expect(ws.map((w) => w.label)).toEqual(['morning', 'noon', 'evening'])
    expect(ws.every((w) => !w.executed)).toBe(true)
  })

  it('todayStr 为 YYYY-MM-DD', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
