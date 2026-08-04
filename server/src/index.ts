import express from 'express'
import cors from 'cors'
import { getCredentials } from './keys.js'
import { findPoolJobs, getJobById, getTask, getTaskConfig, recentRuns, setDecision, updateTask } from './db.js'
import { runCrawl, type RunResult } from './crawler.js'
import { startScheduler } from './scheduler.js'
import { completeTask, failTask, isExtensionOnline, peekTask, touchHeartbeat } from './ext.js'

const DEEPSEEK_BASE = 'https://api.deepseek.com'
const ZHIPU_BASE = 'https://open.bigmodel.cn/api/coding/paas/v4'
const DEEPSEEK_MODEL = 'deepseek-v4-flash'
const ZHIPU_VISION_MODEL = 'glm-4.6v'

const app = express()
app.use(cors())
app.use(express.json({ limit: '25mb' }))

app.get('/api/health', (_req, res) => {
  const creds = getCredentials()
  res.json({
    ok: true,
    deepseek: Boolean(creds.deepseek),
    vision: Boolean(creds.zhipuVision),
    model: DEEPSEEK_MODEL,
    visionModel: ZHIPU_VISION_MODEL,
  })
})

interface ChatRequestBody {
  messages?: Array<{ role: string; content: string }>
  thinking?: 'on' | 'off'
  effort?: 'low' | 'high' | 'max'
  stream?: boolean
  maxTokens?: number
}

// POST /api/ai/chat —— DeepSeek V4 Flash 文本通道（透传流式 SSE）
app.post('/api/ai/chat', async (req, res) => {
  const body = req.body as ChatRequestBody | undefined
  const { messages, thinking = 'on', effort, stream = false, maxTokens } = body ?? {}
  const creds = getCredentials()
  if (!creds.deepseek) {
    res.status(500).json({ error: '未配置 DeepSeek key（auth.json 的 deepseek provider）' })
    return
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages 不能为空' })
    return
  }

  const payload: Record<string, unknown> = {
    model: DEEPSEEK_MODEL,
    messages,
    thinking: { type: thinking === 'off' ? 'disabled' : 'enabled' },
    stream,
  }
  if (effort) payload.reasoning_effort = effort
  if (maxTokens) payload.max_tokens = maxTokens

  try {
    const upstream = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.deepseek}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      if (!upstream.ok) res.status(upstream.status)
      if (!upstream.body) {
        res.end()
        return
      }
      const reader = upstream.body.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(value)
        }
        res.end()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        res.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
        res.end()
      }
      return
    }

    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

interface VisionRequestBody {
  imageDataUri?: string
  prompt?: string
}

// POST /api/ai/vision —— GLM-4.6V 识图通道
app.post('/api/ai/vision', async (req, res) => {
  const body = req.body as VisionRequestBody | undefined
  const { imageDataUri, prompt } = body ?? {}
  const creds = getCredentials()
  if (!creds.zhipuVision) {
    res.status(500).json({ error: '未配置视觉 key（auth.json 的 zhipuai-coding-plan provider）' })
    return
  }
  if (typeof imageDataUri !== 'string' || !imageDataUri.startsWith('data:image/')) {
    res.status(400).json({ error: 'imageDataUri 必须是 data:image/* 格式的 base64' })
    return
  }

  const payload = {
    model: ZHIPU_VISION_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUri } },
          {
            type: 'text',
            text: prompt ?? '请详细、准确地描述这张图片的内容，包括所有可见的文字、界面元素和细节。',
          },
        ],
      },
    ],
    stream: false,
  }

  try {
    const upstream = await fetch(`${ZHIPU_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.zhipuVision}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// ---------------------------------------------------------------------------
// 岗位库：抓取任务 / 待投递池 / 确认忽略 / 日志
// ---------------------------------------------------------------------------

const CONFIG_KEYS = ['keyword', 'city', 'salary', 'platform', 'count', 'threshold', 'minNew', 'poolDays', 'delayRange', 'resumeText'] as const

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

let running = false
let lastResult: RunResult | null = null

app.get('/api/jobs/tasks', (_req, res) => {
  const task = getTask()
  const config = getTaskConfig()
  res.json({
    enabled: task.enabled === 1,
    config: {
      keyword: config.keyword,
      city: config.city,
      salary: config.salary,
      platform: config.platform,
      count: config.count,
      threshold: config.threshold,
      minNew: config.minNew,
      poolDays: config.poolDays,
      delayRange: config.delayRange,
      hasResume: Boolean(config.resumeText.trim()),
    },
    todayWindows: task.today_windows ? (JSON.parse(task.today_windows) as unknown) : null,
    lastRunAt: task.last_run_at,
    skipUntil: task.skip_until,
  })
})

app.put('/api/jobs/tasks', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const config = getTaskConfig()
  for (const k of CONFIG_KEYS) {
    if (body[k] !== undefined) {
      ;(config as unknown as Record<string, unknown>)[k] = body[k]
    }
  }
  config.count = clamp(Number(config.count) || 50, 1, 50)
  config.threshold = clamp(Number(config.threshold) || 65, 0, 100)
  config.minNew = Math.max(0, Number(config.minNew) || 3)
  config.poolDays = clamp(Number(config.poolDays) || 5, 1, 30)
  if (!Array.isArray(config.delayRange) || config.delayRange.length !== 2) config.delayRange = [3, 8]
  updateTask({ config: JSON.stringify(config) })
  if (typeof body.enabled === 'boolean') updateTask({ enabled: body.enabled ? 1 : 0 })
  res.json({ ok: true })
})

app.get('/api/jobs/run/status', (_req, res) => {
  res.json({ running, lastResult })
})

app.post('/api/jobs/run', (req, res) => {
  if (running) {
    res.status(409).json({ error: '已有抓取任务在运行' })
    return
  }
  const resumeText = typeof (req.body as { resumeText?: unknown } | undefined)?.resumeText === 'string' ? (req.body as { resumeText: string }).resumeText : undefined
  res.json({ running: true, message: '抓取已启动，请稍候' })
  void (async () => {
    running = true
    try {
      lastResult = await runCrawl(resumeText)
    } catch (err) {
      lastResult = {
        fetched: 0,
        inserted: 0,
        skippedDup: 0,
        scored: 0,
        newCount: 0,
        skipped: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: 0,
      }
    } finally {
      running = false
    }
  })()
})

app.get('/api/jobs/pool', (_req, res) => {
  const config = getTaskConfig()
  const jobs = findPoolJobs(config, 20)
  res.json({ jobs })
})

app.post('/api/jobs/:id/decision', (req, res) => {
  const id = Number(req.params.id)
  const decision = (req.body as { decision?: unknown } | undefined)?.decision
  if (decision !== 'confirmed' && decision !== 'ignored') {
    res.status(400).json({ error: 'decision 必须是 confirmed 或 ignored' })
    return
  }
  const job = getJobById(id)
  if (!job) {
    res.status(404).json({ error: '岗位不存在' })
    return
  }
  setDecision(id, decision)
  res.json({ ok: true, id, decision })
})

app.get('/api/jobs/logs', (_req, res) => {
  res.json({ runs: recentRuns(50) })
})

// ---------------------------------------------------------------------------
// Chrome 扩展抓取通道：任务领取 / 结果回传 / 在线状态
// ---------------------------------------------------------------------------

app.get('/api/ext/status', (_req, res) => {
  res.json({ online: isExtensionOnline() })
})

app.get('/api/ext/task', (_req, res) => {
  touchHeartbeat()
  const task = peekTask()
  res.json(task ?? { taskId: null })
})

app.post('/api/ext/result', (req, res) => {
  const body = (req.body ?? {}) as { taskId?: unknown; result?: unknown; error?: unknown }
  const taskId = typeof body.taskId === 'string' ? body.taskId : ''
  if (typeof body.error === 'string' && body.error) {
    failTask(taskId, body.error)
  } else {
    completeTask(taskId, body.result)
  }
  res.json({ ok: true })
})

const PORT = Number(process.env.PORT ?? 3001)
app.listen(PORT, () => {
  console.log(`[job-tracker] AI 代理已启动: http://localhost:${PORT}`)
  startScheduler(() => runCrawl())
  console.log('[job-tracker] 岗位抓取调度已启动（每日 3 窗口：08-09 / 12-14 / 18-19）')
})
