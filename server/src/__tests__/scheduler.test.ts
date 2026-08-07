import { describe, it, expect } from 'vitest'
import { generateTodayWindows, pickPendingWindow, randomTimeInWindow, todayStr, type WindowSchedule } from '../scheduler.js'

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

  it('补跑：窗口时间已过且未执行 → 选中（休眠错过场景）', () => {
    const ws: WindowSchedule[] = [
      { label: 'morning', time: '08:36', executed: false },
      { label: 'noon', time: '13:28', executed: false },
      { label: 'evening', time: '18:54', executed: false },
    ]
    // 当前 11:05 → morning(8:36) 已过未执行，应选中补跑
    expect(pickPendingWindow(ws, 11 * 60 + 5)?.label).toBe('morning')
  })

  it('未到时间不触发（不提前执行未到窗口）', () => {
    const ws: WindowSchedule[] = [
      { label: 'morning', time: '08:36', executed: false },
      { label: 'noon', time: '13:28', executed: false },
      { label: 'evening', time: '18:54', executed: false },
    ]
    // 当前 07:00 → 最早窗口 08:36 未到，不应选中
    expect(pickPendingWindow(ws, 7 * 60)).toBeNull()
  })

  it('已执行窗口不重复补跑', () => {
    const ws: WindowSchedule[] = [
      { label: 'morning', time: '08:36', executed: true },
      { label: 'noon', time: '13:28', executed: false },
      { label: 'evening', time: '18:54', executed: false },
    ]
    // 当前 15:00 → morning 已执行跳过，noon(13:28) 已过未执行 → 选中 noon
    expect(pickPendingWindow(ws, 15 * 60)?.label).toBe('noon')
  })

  it('全部已执行 → 不触发', () => {
    const ws: WindowSchedule[] = [
      { label: 'morning', time: '08:36', executed: true },
      { label: 'noon', time: '13:28', executed: true },
      { label: 'evening', time: '18:54', executed: true },
    ]
    expect(pickPendingWindow(ws, 20 * 60)).toBeNull()
  })

  it('按顺序补跑最早未执行窗口（morning→noon→evening）', () => {
    const ws: WindowSchedule[] = [
      { label: 'morning', time: '08:36', executed: false },
      { label: 'noon', time: '13:28', executed: true },
      { label: 'evening', time: '18:54', executed: false },
    ]
    // morning 已过未执行，即使 noon 已在它后面也先补 morning
    expect(pickPendingWindow(ws, 20 * 60)?.label).toBe('morning')
  })
})
