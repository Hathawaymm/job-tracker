import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// 极简日志：console + 按天滚动文件双写，零依赖
// 文件位置：server/data/logs/jobtracker-YYYY-MM-DD.log（追加，tsx watch 重启不丢）
// ---------------------------------------------------------------------------

const DATA_DIR = join(fileURLToPath(new URL('../data/logs/', import.meta.url)))

function logFile(): string {
  const d = new Date().toISOString().slice(0, 10)
  return join(DATA_DIR, `jobtracker-${d}.log`)
}

function write(level: 'INFO' | 'ERROR' | 'WARN', tag: string, msg: string): void {
  const line = `${new Date().toISOString()} [${tag}] ${level} ${msg}`
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    appendFileSync(logFile(), line + '\n')
  } catch {
    // 文件写入失败不阻塞业务，降级为仅 console
  }
}

function fmt(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack ?? a.message
      if (typeof a === 'object' && a !== null) {
        try {
          return JSON.stringify(a)
        } catch {
          return String(a)
        }
      }
      return String(a)
    })
    .join(' ')
}

export const log = {
  info(tag: string, ...args: unknown[]): void {
    const msg = fmt(args)
    console.log(`[${tag}] ${msg}`)
    write('INFO', tag, msg)
  },
  warn(tag: string, ...args: unknown[]): void {
    const msg = fmt(args)
    console.warn(`[${tag}] ${msg}`)
    write('WARN', tag, msg)
  },
  error(tag: string, ...args: unknown[]): void {
    const msg = fmt(args)
    console.error(`[${tag}] ${msg}`)
    write('ERROR', tag, msg)
  },
}
