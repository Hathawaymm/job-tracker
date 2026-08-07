import cron from 'node-cron'
import { getTask, updateTask } from './db.js'
import { log } from './logger.js'

export interface WindowDef {
  label: string
  start: string
  end: string
}

/** 每日抓取窗口：上午 / 中午 / 晚上，各窗口内随机一个时刻执行一次 */
export const WINDOWS: WindowDef[] = [
  { label: 'morning', start: '08:00', end: '09:00' },
  { label: 'noon', start: '12:00', end: '14:00' },
  { label: 'evening', start: '18:00', end: '19:00' },
]

export interface WindowSchedule {
  label: string
  time: string
  executed: boolean
}

export function todayStr(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

/** 在窗口 [start, end] 内随机一个执行时刻 HH:mm */
export function randomTimeInWindow(def: WindowDef): string {
  const [sh, sm] = def.start.split(':').map(Number)
  const [eh, em] = def.end.split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  const total = Math.floor(startMin + Math.random() * (endMin - startMin))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function generateTodayWindows(): WindowSchedule[] {
  return WINDOWS.map((w) => ({ label: w.label, time: randomTimeInWindow(w), executed: false }))
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** 补跑策略：返回第一个「时间已到/已过且未执行」的窗口；当前分钟尚未到则返回 null */
export function pickPendingWindow(windows: WindowSchedule[], nowMin: number): WindowSchedule | null {
  return windows.find((w) => !w.executed && timeToMin(w.time) <= nowMin) ?? null
}

interface StoredWindows {
  date: string
  windows: WindowSchedule[]
}

function ensureTodayWindows(): WindowSchedule[] {
  const task = getTask()
  const today = todayStr()
  if (task.today_windows) {
    try {
      const parsed = JSON.parse(task.today_windows) as StoredWindows
      if (parsed.date === today && Array.isArray(parsed.windows)) return parsed.windows
    } catch {
      // 忽略损坏数据，重新生成
    }
  }
  const windows = generateTodayWindows()
  updateTask({ today_windows: JSON.stringify({ date: today, windows }) })
  return windows
}

export function isSkippedToday(task = getTask()): boolean {
  return Boolean(task.skip_until && todayStr() < task.skip_until)
}

/** 启动每日调度：每分钟 tick，命中窗口随机时刻即执行一次 */
export function startScheduler(run: () => Promise<unknown>): void {
  cron.schedule('* * * * *', () => {
    void tick(run)
  })
}

async function tick(run: () => Promise<unknown>): Promise<void> {
  const task = getTask()
  if (!task.enabled) return

  // 自适应跳过：skip_until 未到则跳过；已到则恢复
  if (task.skip_until && todayStr() < task.skip_until) return
  if (task.skip_until && todayStr() >= task.skip_until) {
    updateTask({ skip_until: null })
  }

  const windows = ensureTodayWindows()
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  // 补跑策略：时间已到/已过的窗口若未执行，立即执行（覆盖电脑休眠错过的窗口；
  // pmset 定时唤醒后第一个 tick 即补跑，无需精确分钟匹配）
  const pending = pickPendingWindow(windows, nowMin)
  if (!pending) return

  // 先标记执行，防止重复触发
  updateTask({
    today_windows: JSON.stringify({
      date: todayStr(),
      windows: windows.map((w) => (w.label === pending.label ? { ...w, executed: true } : w)),
    }),
  })
  const missed = timeToMin(pending.time) < nowMin
  log.info('scheduler', missed ? `补跑错过的窗口 ${pending.label}（${pending.time}，当前 ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}）` : `触发窗口 ${pending.label}（${pending.time}）`)
  try {
    await run()
  } catch (err) {
    log.error('scheduler', '窗口抓取失败:', err instanceof Error ? err.message : err)
  }
}
