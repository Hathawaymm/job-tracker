import express from 'express'
import cors from 'cors'
import { getCredentials } from './keys.js'
import { DEFAULT_TASK_CONFIG, batchFindExistingKeys, findPoolJobs, getJobById, getTask, getTaskConfig, recentRuns, setDecision, updateTask } from './db.js'
import { deleteExperience, insertExperience, listExperiences, updateExperience, buildResumeFromBank } from './db.js'
import { getAppState, setAppState } from './db.js'
import { fetchJobByUrl, runCrawl, type RunResult } from './crawler.js'
import { startScheduler } from './scheduler.js'
import { completeTask, failTask, getProgress, isExtensionOnline, peekTask, touchHeartbeat } from './ext.js'
import { uniqueKey } from './hash.js'
import { log } from './logger.js'

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

const CONFIG_KEYS = ['keyword', 'city', 'salary', 'salaryUnit', 'platform', 'count', 'threshold', 'minNew', 'poolDays', 'delayRange', 'resumeText', 'targetIndustries'] as const

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
      salaryUnit: config.salaryUnit,
      platform: config.platform,
      count: config.count,
      threshold: config.threshold,
      minNew: config.minNew,
      poolDays: config.poolDays,
      delayRange: config.delayRange,
      hasResume: Boolean(config.resumeText.trim()),
      targetIndustries: config.targetIndustries,
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
  if (config.salaryUnit !== 'month' && config.salaryUnit !== 'year') config.salaryUnit = 'month'
  if (!Array.isArray(config.delayRange) || config.delayRange.length !== 2) config.delayRange = [3, 8]
  if (!Array.isArray(config.targetIndustries)) config.targetIndustries = DEFAULT_TASK_CONFIG.targetIndustries
  updateTask({ config: JSON.stringify(config) })
  if (typeof body.enabled === 'boolean') updateTask({ enabled: body.enabled ? 1 : 0 })
  res.json({ ok: true })
})

app.get('/api/jobs/run/status', (_req, res) => {
  res.json({ running, lastResult })
})

// 需求5：抓取实时进度
app.get('/api/jobs/progress', (_req, res) => {
  res.json({ progress: getProgress(), running })
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
      lastResult = await runCrawl('manual', resumeText)
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

// 手动新增：按招聘链接抓取岗位并入库（绕过列表反爬，需扩展在线）
app.post('/api/jobs/manual', async (req, res) => {
  const body = (req.body ?? {}) as { url?: unknown; platform?: unknown }
  const url = typeof body.url === 'string' ? body.url : ''
  const platform = typeof body.platform === 'string' ? body.platform : 'manual'
  if (!url.trim()) {
    res.status(400).json({ error: '请填写招聘链接' })
    return
  }
  try {
    const job = await fetchJobByUrl(url, platform)
    res.json({ ok: true, job })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
})

// 方案 B：批量比对岗位是否已存在（扩展翻页时调用，返回已存在的下标）
app.post('/api/jobs/batch-check', (req, res) => {
  const body = (req.body ?? {}) as { platform?: unknown; jobs?: unknown }
  const platform = typeof body.platform === 'string' ? body.platform : 'liepin'
  const jobs = Array.isArray(body.jobs) ? body.jobs : []
  const existingIndices: number[] = []
  const keys: string[] = []
  const byKey = new Map<string, number>()
  jobs.forEach((raw, i) => {
    const o = (raw ?? {}) as { externalId?: unknown; company?: unknown; title?: unknown; city?: unknown }
    const uk = uniqueKey(
      platform,
      typeof o.externalId === 'string' ? o.externalId : null,
      typeof o.company === 'string' ? o.company : '',
      typeof o.title === 'string' ? o.title : '',
      typeof o.city === 'string' ? o.city : '',
    )
    keys.push(uk)
    byKey.set(uk, i)
  })
  for (const k of batchFindExistingKeys(keys)) {
    const idx = byKey.get(k)
    if (idx !== undefined) existingIndices.push(idx)
  }
  res.json({ existingIndices })
})

// ---------------------------------------------------------------------------
// 个人经历库：跨端持久 CRUD
// ---------------------------------------------------------------------------

interface ExperienceBody {
  type?: unknown
  company?: unknown
  name?: unknown
  role?: unknown
  period?: unknown
  description?: unknown
  points?: unknown
  tags?: unknown
  school?: unknown
  major?: unknown
  degree?: unknown
  highlights?: unknown
  title?: unknown
  city?: unknown
  phone?: unknown
  email?: unknown
  summary?: unknown
  skills?: unknown
}

function parseExperienceBody(body: ExperienceBody): { name: string; fields: Omit<ExperienceItemInput, 'name'> } | null {
  if (typeof body.name !== 'string' || !body.name.trim()) return null
  return {
    name: body.name.trim(),
    fields: {
      type: ['project', 'work', 'edu', 'profile'].includes(String(body.type))
        ? (body.type as ExperienceItemInput['type'])
        : 'project',
      company: typeof body.company === 'string' ? body.company : '',
      role: typeof body.role === 'string' ? body.role : '',
      period: typeof body.period === 'string' ? body.period : '',
      description: typeof body.description === 'string' ? body.description : '',
      points: Array.isArray(body.points) ? (body.points as string[]) : [],
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : [],
      school: typeof body.school === 'string' ? body.school : '',
      major: typeof body.major === 'string' ? body.major : '',
      degree: typeof body.degree === 'string' ? body.degree : '',
      highlights: Array.isArray(body.highlights) ? (body.highlights as string[]) : [],
      title: typeof body.title === 'string' ? body.title : '',
      city: typeof body.city === 'string' ? body.city : '',
      phone: typeof body.phone === 'string' ? body.phone : '',
      email: typeof body.email === 'string' ? body.email : '',
      summary: typeof body.summary === 'string' ? body.summary : '',
      skills: Array.isArray(body.skills) ? (body.skills as string[]) : [],
    },
  }
}

interface ExperienceItemInput {
  type: 'project' | 'work' | 'edu' | 'profile'
  company: string
  name: string
  role: string
  period: string
  description: string
  points: string[]
  tags: string[]
  school: string
  major: string
  degree: string
  highlights: string[]
  title: string
  city: string
  phone: string
  email: string
  summary: string
  skills: string[]
}

app.get('/api/experiences', (req, res) => {
  const type = typeof req.query.type === 'string' ? req.query.type : ''
  const items = listExperiences()
  res.json({ items: type ? items.filter((x) => x.type === type) : items })
})

// SSOT 聚合：经历库 4 类条目 → 完整 Resume（AI 生成简历的数据源）
app.get('/api/experiences/resume', (_req, res) => {
  res.json({ resume: buildResumeFromBank() })
})

app.post('/api/experiences', (req, res) => {
  const parsed = parseExperienceBody((req.body ?? {}) as ExperienceBody)
  if (!parsed) {
    res.status(400).json({ error: 'name 不能为空' })
    return
  }
  const item = insertExperience({ ...parsed.fields, name: parsed.name })
  res.json({ ok: true, item })
})

app.put('/api/experiences/:id', (req, res) => {
  const id = Number(req.params.id)
  const parsed = parseExperienceBody((req.body ?? {}) as ExperienceBody)
  if (!parsed) {
    res.status(400).json({ error: 'name 不能为空' })
    return
  }
  const item = updateExperience(id, { ...parsed.fields, name: parsed.name })
  if (!item) {
    res.status(404).json({ error: '经历不存在' })
    return
  }
  res.json({ ok: true, item })
})

app.delete('/api/experiences/:id', (req, res) => {
  const ok = deleteExperience(Number(req.params.id))
  res.json({ ok })
})

// ---------------------------------------------------------------------------
// 前端业务数据持久化（app_state 键值对）：resumes / jobs / interviews / logs
// ---------------------------------------------------------------------------

const APP_STATE_KEYS = ['resumes', 'jobs', 'interviews', 'logs'] as const

app.get('/api/app-state', (_req, res) => {
  const data: Record<string, unknown> = {}
  for (const k of APP_STATE_KEYS) {
    const raw = getAppState(k)
    if (raw !== null) {
      try {
        data[k] = JSON.parse(raw)
      } catch {
        data[k] = []
      }
    } else {
      data[k] = []
    }
  }
  res.json(data)
})

app.put('/api/app-state', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  for (const k of APP_STATE_KEYS) {
    if (k in body) {
      setAppState(k, JSON.stringify(body[k] ?? []))
    }
  }
  res.json({ ok: true })
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
    log.error('ext', `任务回传失败 taskId=${taskId} error=${body.error}`)
    failTask(taskId, body.error)
  } else {
    const resultShape = Array.isArray(body.result)
      ? `array[${body.result.length}]`
      : typeof body.result === 'object' && body.result !== null
        ? `object{${Object.keys(body.result as object).join(',')}}`
        : typeof body.result
    log.info('ext', `任务回传成功 taskId=${taskId} shape=${resultShape}`)
    completeTask(taskId, body.result)
  }
  res.json({ ok: true })
})

// 全局错误兜底：未捕获异常留痕，避免问题静默丢失
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error('api', '未捕获异常:', err instanceof Error ? err.stack ?? err.message : err)
  res.status(500).json({ error: '服务内部错误' })
})

const PORT = Number(process.env.PORT ?? 3001)
app.listen(PORT, () => {
  log.info('job-tracker', `AI 代理已启动: http://localhost:${PORT}`)
  startScheduler(() => runCrawl('scheduled'))
  log.info('job-tracker', '岗位抓取调度已启动（每日 3 窗口：08-09 / 12-14 / 18-19）')
})
