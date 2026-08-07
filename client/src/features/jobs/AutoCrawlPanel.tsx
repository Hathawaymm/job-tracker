import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getCrawlProgress,
  getExtStatus,
  getRunStatus,
  getTasks,
  triggerCrawl,
  updateTasks,
  type CrawlProgress,
  type TaskInfo,
} from '../../lib/jobsApi'
import { resumeToText } from '../../lib/prompts'
import { ResumePicker, useResumeSelection } from '../../components/ResumePicker'

const WINDOW_LABEL: Record<string, string> = { morning: '上午', noon: '中午', evening: '晚上' }
const PLATFORM_LABEL: Record<string, string> = { boss: 'BOSS直聘', liepin: '猎聘' }
const PLATFORM_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'liepin', label: '猎聘' },
  { value: 'boss', label: 'BOSS直聘' },
]

interface Props {
  onPoolChanged: () => void
}

export default function AutoCrawlPanel({ onPoolChanged }: Props) {
  const sel = useResumeSelection('crawl')
  const resumeText = sel.version ? resumeToText(sel.version.resume) : ''
  const [task, setTask] = useState<TaskInfo | null>(null)
  const [extOnline, setExtOnline] = useState<boolean | null>(null)
  const [keyword, setKeyword] = useState('')
  const [city, setCity] = useState('')
  const [salary, setSalary] = useState('')
  const [salaryUnit, setSalaryUnit] = useState<'month' | 'year'>('month')
  const [platform, setPlatform] = useState('liepin')
  const [count, setCount] = useState(50)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [progress, setProgress] = useState<CrawlProgress | null>(null)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadTasks = useCallback(async () => {
    try {
      const t = await getTasks()
      setTask(t)
      setKeyword(t.config.keyword)
      setCity(t.config.city)
      setSalary(t.config.salary)
      setSalaryUnit(t.config.salaryUnit ?? 'month')
      setPlatform(t.config.platform)
      setCount(t.config.count)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载任务配置失败')
    }
  }, [])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  const refreshExt = useCallback(async () => {
    try {
      const s = await getExtStatus()
      setExtOnline(s.online)
    } catch {
      setExtOnline(null)
    }
  }, [])

  useEffect(() => {
    void refreshExt()
    // 自动轮询扩展在线状态（10s），避免休眠/关闭 Chrome 后状态过期
    const timer = setInterval(() => void refreshExt(), 10000)
    return () => clearInterval(timer)
  }, [refreshExt])

  const saveConfig = async () => {
    setErr('')
    setMsg('')
    try {
      await updateTasks({ keyword, city, salary, salaryUnit, platform, count, resumeText })
      setMsg('搜索设置已保存')
      void loadTasks()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败')
    }
  }

  const toggleEnabled = async (enabled: boolean) => {
    try {
      await updateTasks({ enabled })
      void loadTasks()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '切换定时失败')
    }
  }

  const runNow = async () => {
    setErr('')
    setMsg('')
    void refreshExt()
    setBusy(true)
    setProgress(null)
    try {
      await triggerCrawl(resumeText)
      // 需求5：抓取期间轮询实时进度
      progressTimer.current = setInterval(() => {
        void getCrawlProgress()
          .then((p) => setProgress(p.progress))
          .catch(() => {})
      }, 1200)

      for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 1500))
        const [st] = await Promise.all([getRunStatus(), getCrawlProgress().catch(() => null)])
        if (!st.running) {
          const r = st.lastResult
          if (r?.error) setErr(r.error)
          else
            setMsg(
              `抓取完成：抓取 ${r?.fetched ?? 0} 条，新增 ≥${task?.config.threshold ?? 65}% ${r?.newCount ?? 0} 条，耗时 ${Math.round((r?.durationMs ?? 0) / 1000)} 秒${r?.skipped ? '（市场机会少，已自动跳过后续时段）' : ''}`,
            )
          break
        }
      }
      void loadTasks()
      onPoolChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '抓取失败')
    } finally {
      if (progressTimer.current) {
        clearInterval(progressTimer.current)
        progressTimer.current = null
      }
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <h3>🤖 自动抓取（{PLATFORM_LABEL[platform] ?? platform}）</h3>
      <div className="info-box">
        每天 <b>3 个时段</b>（上午 8-9 点 / 中午 12-14 点 / 晚上 18-19 点）各在窗口内随机时刻抓取一次，每次最多 50 条 → AI 匹配（结合简历）→ <b>匹配度 ≥65%</b> 进入下方待投递池。新增 &lt;3 条时自动跳过后续时段，次日恢复。
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <ResumePicker selection={sel} />
        <span className="small">
          抓取扩展：
          {extOnline === true ? (
            <b style={{ color: 'var(--green)' }}>🟢 在线</b>
          ) : extOnline === false ? (
            <b style={{ color: 'var(--amber)' }}>⚪ 离线</b>
          ) : (
            <span className="muted">⚫ 未知</span>
          )}
          <button className="link small" onClick={() => void refreshExt()}>刷新</button>
        </span>
        {sel.version && !sel.version.resume.name && (
          <span className="muted small">⚠ 当前简历内容为空，AI 匹配会受影响，请先在「简历」页完善</span>
        )}
      </div>

      {extOnline === false && (
        <div className="warn-box">
          <b>抓取扩展未在线：</b>抓取依赖你在 Chrome 里安装「AI 求职助手抓取」扩展（复用你的猎聘/BOSS 登录态）。
          <br />
          安装步骤：① Chrome 地址栏打开 <code>chrome://extensions</code> → ② 右上角开启「开发者模式」 → ③ 点「加载已解压的扩展程序」 → ④ 选择本项目的 <code>extension/install-this</code> 目录。
          <br />
          安装后刷新本页面即可使用「立即抓取」。仅与本地服务（127.0.0.1:3001）通信，不上传任何数据。
          <br />
          <span className="muted">提示：电脑休眠 / Chrome 关闭时此处会显示离线，属正常现象；唤醒后自动恢复。</span>
        </div>
      )}

      <div className="row">
        <div className="field">
          <label>抓取平台 *</label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {PLATFORM_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>岗位名称 *</label>
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="如：前端开发工程师" />
        </div>
        <div className="field">
          <label>城市</label>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="如：上海（留空=全国）" />
        </div>
        <div className="field">
          <label>薪资范围</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder={salaryUnit === 'month' ? '如：20k-30k' : '如：30-50万'}
              style={{ flex: 1 }}
            />
            <select
              value={salaryUnit}
              onChange={(e) => setSalaryUnit(e.target.value as 'month' | 'year')}
              style={{ width: 'auto' }}
            >
              <option value="month">月薪 k</option>
              <option value="year">年薪 万</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>单次抓取上限</label>
          <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value) || 50)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="primary" disabled={busy} onClick={() => void runNow()}>
          {busy ? <><span className="spinner" /> 抓取中…</> : '⚡ 立即抓取'}
        </button>
        <button className="ghost" onClick={() => void saveConfig()}>保存搜索设置</button>
        <button className="ghost" onClick={() => void loadTasks()}>刷新状态</button>
        {task && (
          <label className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={task.enabled}
              onChange={(e) => void toggleEnabled(e.target.checked)}
              style={{ width: 'auto' }}
            />
            开启定时抓取
          </label>
        )}
        {!task?.config.hasResume && (
          <span className="muted small">⚠ 尚未同步简历到服务器（保存设置时会带上简历）</span>
        )}
      </div>

      {/* 需求5：抓取实时进度 */}
      {busy && progress && (
        <div className="info-box" style={{ marginTop: 10 }}>
          {progress.phase === 'crawling' && (
            <span>
              <span className="spinner" /> 正在从 {PLATFORM_LABEL[progress.platform] ?? progress.platform} 抓取岗位，预计还需 1-2 分钟 ⏳
            </span>
          )}
          {progress.phase === 'scoring' && (
            <span>
              已抓取 {progress.fetched}/{progress.total} 条，已匹配 {progress.scored}/{progress.total} 条，
              符合条件 {progress.matched} 条 {progress.matched > 0 ? '✅' : '❤️'}
            </span>
          )}
          {progress.phase === 'done' && <span>✅ 抓取完成</span>}
          {progress.fetched > 0 && progress.total > 0 && (
            <div
              style={{
                height: 6,
                background: '#e5e7eb',
                borderRadius: 4,
                marginTop: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, Math.round((progress.fetched / progress.total) * 100))}%`,
                  background: 'var(--green)',
                  transition: 'width 0.5s',
                }}
              />
            </div>
          )}
        </div>
      )}

      {err && <div className="error-box" style={{ marginTop: 10 }}>{err}</div>}
      {msg && <div className="info-box" style={{ marginTop: 10 }}>{msg}</div>}

      {task && (
        <div className="small muted" style={{ marginTop: 12 }}>
          <b>今日窗口：</b>
          {task.todayWindows?.windows.map((w) => (
            <span key={w.label} style={{ marginRight: 12 }}>
              {WINDOW_LABEL[w.label] ?? w.label} {w.time}
              {w.executed ? ' ✓' : ''}
            </span>
          )) ?? '未生成'}
          {task.lastRunAt && (
            <>
              {' '}· <b>上次抓取：</b>
              {new Date(task.lastRunAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </>
          )}
          {task.skipUntil && <span style={{ color: 'var(--amber)' }}> · 已跳过后续时段（{task.skipUntil} 恢复）</span>}
        </div>
      )}
    </div>
  )
}
