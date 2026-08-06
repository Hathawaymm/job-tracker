import { useState } from 'react'
import { useApp } from '../../hooks/useAppState'
import { composeResumeForJob, matchJob, pickProjectsForJob } from '../../lib/ai'
import { findDuplicateJob } from '../../lib/dedupe'
import { makeJob } from '../../lib/storage'
import { nowIso } from '../../lib/id'
import { mergeExtractedResume } from '../../lib/scoring'
import { fitLevelFromScore, getExperiences, manualFetchJob, setJobDecision, type PoolJob } from '../../lib/jobsApi'
import type { Job } from '../../types'
import { ResumePicker, useResumeSelection } from '../../components/ResumePicker'
import JobEditor from './JobEditor'
import AutoCrawlPanel from './AutoCrawlPanel'
import PoolList from './PoolList'

type FilterKey = 'all' | 'pending' | 'high' | 'medium' | 'low' | 'reject'

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '未筛选' },
  { key: 'high', label: '高匹配' },
  { key: 'medium', label: '可尝试' },
  { key: 'low', label: '低匹配' },
  { key: 'reject', label: '建议拒绝' },
]

function fitClass(level: string): string {
  return `badge ${level}`
}

export default function JobsPage() {
  const { state, addJob, updateJob, deleteJob, addLog, addResumeVersion } = useApp()
  const jobs = state.jobs
  const sel = useResumeSelection('jobs')
  const resume = sel.version?.resume ?? null
  const [editing, setEditing] = useState<'new' | Job | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [filteringId, setFilteringId] = useState<string | null>(null)
  const [filteringAll, setFilteringAll] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [manualUrl, setManualUrl] = useState('')
  const [manualBusy, setManualBusy] = useState(false)
  const [composingId, setComposingId] = useState<string | null>(null)
  const [poolRefresh, setPoolRefresh] = useState(0)

  /** 待投递池确认：转入手动岗位库（进话术/投递流程），并写服务器去重 */
  const handlePoolConfirm = async (poolJob: PoolJob) => {
    setError('')
    const score = poolJob.match_score ?? 0
    const job = makeJob({
      company: poolJob.company,
      title: poolJob.title,
      city: poolJob.city,
      salary: poolJob.salary,
      channel: poolJob.platform === 'boss' ? 'BOSS直聘' : poolJob.platform === 'liepin' ? '猎聘' : poolJob.platform,
      url: poolJob.url,
      jdText: poolJob.jd || poolJob.title,
      source: 'manual',
      match: {
        score,
        fitLevel: fitLevelFromScore(score),
        reason: poolJob.match_reason,
        suggestion: '来自自动抓取 AI 推荐',
        checkedAt: nowIso(),
      },
      confirmed: true,
    })
    addJob(job)
    addLog(job, '确认投递目标（自动抓取）', `匹配度 ${score} 分`)
    await setJobDecision(poolJob.id, 'confirmed')
    setPoolRefresh((k) => k + 1)
    setDone(`「${poolJob.company}·${poolJob.title}」已加入投递清单，可前往「招呼语」生成定制话术`)
  }

  const handleAdd = (data: Partial<Job>) => {
    setError('')
    const dup = findDuplicateJob(jobs, { company: data.company ?? '', title: data.title ?? '', url: data.url })
    if (dup) {
      setError(`「${data.company}·${data.title}」与已有岗位重复，已自动拦截（去重保护）`)
      return
    }
    const job = makeJob({ ...data, source: data.jdImageDataUri ? 'screenshot' : 'manual' })
    addJob(job)
    addLog(job, '录入岗位')
    setEditing(null)
    setDone(`已录入：${job.company}·${job.title}`)
  }

  const handleUpdate = (id: string, data: Partial<Job>) => {
    updateJob(id, data)
    setEditing(null)
    setDone('岗位已更新')
  }

  const handleMatch = async (job: Job) => {
    if (!resume) {
      setError('没有可用的简历版本，请先在「简历」页创建')
      return
    }
    if (!resume.name && resume.projects.length === 0 && !resume.summary) {
      setError('该简历版本内容为空，请先到「简历」页填写后再筛选')
      return
    }
    if (!job.jdText.trim()) {
      setError('该岗位还没有 JD 内容，请先补充 JD')
      return
    }
    setError('')
    setFilteringId(job.id)
    try {
      const payload = await matchJob(resume, job.jdText)
      updateJob(job.id, { match: { ...payload, checkedAt: nowIso() } })
      addLog(job, 'AI 筛选完成', `${payload.fitLevel} · ${payload.score} 分 · ${payload.reason}`)
      setDone(`「${job.company}·${job.title}」筛选完成`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '筛选失败')
    } finally {
      setFilteringId(null)
    }
  }

  const handleMatchAll = async () => {
    if (!resume) {
      setError('没有可用的简历版本，请先在「简历」页创建')
      return
    }
    const pending = jobs.filter((j) => !j.match && j.jdText.trim())
    if (pending.length === 0) {
      setDone('没有待筛选的岗位')
      return
    }
    setFilteringAll(true)
    setError('')
    for (const job of pending) {
      if (!resume.name && resume.projects.length === 0 && !resume.summary) {
        setError('该简历版本内容为空，请先到「简历」页填写后再筛选')
        break
      }
      try {
        const payload = await matchJob(resume, job.jdText)
        updateJob(job.id, { match: { ...payload, checkedAt: nowIso() } })
        addLog(job, 'AI 筛选完成', `${payload.fitLevel} · ${payload.score} 分`)
      } catch (err) {
        setError(`筛选「${job.company}·${job.title}」失败：${err instanceof Error ? err.message : String(err)}`)
        break
      }
    }
    setFilteringAll(false)
    setDone('批量筛选完成')
  }

  /** 针对岗位生成针对性简历：经历库挑选项目 → AI 组装 → 新简历版本 */
  const handleComposeResume = async (job: Job) => {
    setError('')
    setDone('')
    if (!resume) {
      setError('没有可用的简历版本作为基础，请先在「简历」页创建')
      return
    }
    if (!job.jdText.trim()) {
      setError('该岗位没有 JD 内容，请先补充 JD 或重新录入')
      return
    }
    setComposingId(job.id)
    try {
      const items = await getExperiences()
      if (items.length === 0) {
        setError('个人经历库为空，请先到「经历库」页录入项目经历')
        return
      }
      const picked = await pickProjectsForJob(job.jdText, items, resume)
      const valid = picked.selected.filter((p) => items.some((it) => it.id === p.id))
      if (valid.length === 0) {
        setError('AI 未从经历库中选中任何项目，请重试或检查经历库')
        return
      }
      const ext = await composeResumeForJob(job.jdText, valid, items, resume)
      const composed = mergeExtractedResume(resume, ext)
      const name = `AI-${job.title}-${new Date().toISOString().slice(0, 10)}`
      addResumeVersion(name, composed)
      addLog(job, '生成针对性简历', `选用 ${valid.length} 个项目 → 版本「${name}」`)
      setDone(`已生成针对性简历版本「${name}」，可到「简历」页查看/编辑；投递该岗位建议使用此版本`)
      if (!job.match && composed.projects.length > 0) {
        void handleMatch(job)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成针对性简历失败')
    } finally {
      setComposingId(null)
    }
  }

  const handleConfirm = (job: Job) => {
    updateJob(job.id, { confirmed: true })
    addLog(job, '确认投递目标', `匹配度 ${job.match?.score ?? 0} 分`)
    setDone(`已确认「${job.company}·${job.title}」，可前往「招呼语」生成定制话术`)
  }

  /** 手动新增：粘贴招聘链接 → server 经扩展抓取 JD 入库 → 转为本地岗位 */
  const handleManualFetch = async () => {
    setError('')
    setDone('')
    const url = manualUrl.trim()
    if (!/^https?:\/\//i.test(url)) {
      setError('请粘贴以 http(s):// 开头的招聘链接')
      return
    }
    setManualBusy(true)
    try {
      const r = await manualFetchJob(url)
      if (!r.ok || !r.job) throw new Error(r.error ?? '抓取失败')
      const dup = findDuplicateJob(jobs, { company: r.job.company ?? '', title: r.job.title ?? '', url: r.job.url })
      if (dup) {
        setError(`「${r.job.company || r.job.title}」与已有岗位重复，已自动拦截（去重保护）`)
        return
      }
      const job = makeJob({
        company: r.job.company || r.job.platform,
        title: r.job.title,
        city: r.job.city,
        salary: r.job.salary,
        channel: r.job.platform === 'liepin' ? '猎聘' : r.job.platform === 'boss' ? 'BOSS直聘' : r.job.platform,
        url: r.job.url,
        jdText: r.job.jd || r.job.title,
        source: 'manual',
      })
      addJob(job)
      addLog(job, '录入岗位（链接抓取）', `${r.job.platform} · ${job.company || job.title}`)
      setManualUrl('')
      setDone(`已抓取并录入「${job.title}」，可继续 AI 筛选 / 生成招呼语 / 针对性简历`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '链接抓取失败')
    } finally {
      setManualBusy(false)
    }
  }

  const filtered = jobs.filter((j) => {
    switch (filter) {
      case 'pending':
        return !j.match
      case 'high':
      case 'medium':
      case 'low':
      case 'reject':
        return j.match?.fitLevel === filter
      default:
        return true
    }
  })

  return (
    <div>
      <AutoCrawlPanel onPoolChanged={() => setPoolRefresh((k) => k + 1)} />
      <PoolList onConfirm={handlePoolConfirm} refreshKey={poolRefresh} />

      <div className="panel">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>手动管理</h3>
          <ResumePicker selection={sel} />
          <span style={{ flex: 1 }} />
          <button className="primary" onClick={() => setEditing('new')}>
            + 新增岗位
          </button>
          <button className="ghost" disabled={manualBusy} onClick={() => void handleManualFetch()}>
            {manualBusy ? <><span className="spinner" /> 抓取中…</> : '🔗 粘贴链接抓取'}
          </button>
          <button className="ghost" disabled={filteringAll} onClick={() => void handleMatchAll()}>
            {filteringAll ? (
              <>
                <span className="spinner" /> 批量筛选中…
              </>
            ) : (
              '🤖 AI 筛选全部未筛岗位'
            )}
          </button>
          <span className="muted small">共 {jobs.length} 个岗位 · 未筛 {jobs.filter((j) => !j.match).length} · 已确认 {jobs.filter((j) => j.confirmed).length}</span>
        </div>
        {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}
        {done && <div className="info-box" style={{ marginTop: 10 }}>{done}</div>}
        {(manualUrl || manualBusy) && (
          <div className="row" style={{ marginTop: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>招聘链接（支持任意平台，如 BOSS/猎聘/智联等详情页）</label>
              <input
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleManualFetch()}
                placeholder="https://www.zhipin.com/... 或 https://www.liepin.com/job/xxx.shtml"
                disabled={manualBusy}
              />
            </div>
          </div>
        )}
      </div>

      {editing && (
        <JobEditor
          initial={editing === 'new' ? undefined : editing}
          onSubmit={(data) => {
            if (editing === 'new') handleAdd(data)
            else handleUpdate(editing.id, data)
          }}
          onCancel={() => setEditing(null)}
          submitLabel={editing === 'new' ? '录入岗位' : '保存修改'}
        />
      )}

      <div className="tabs" style={{ borderBottom: 'none', marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button key={f.key} className={filter === f.key ? 'active' : ''} onClick={() => setFilter(f.key)}>
            {f.label}
            <span className="muted small">
              {' '}
              {f.key === 'all'
                ? jobs.length
                : jobs.filter((j) => (f.key === 'pending' ? !j.match : j.match?.fitLevel === f.key)).length}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && <div className="empty">暂无岗位，点击「新增岗位」开始录入</div>}

      <div className="grid grid-2">
        {filtered.map((job) => (
          <div key={job.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontWeight: 600 }}>
                {job.company} · {job.title}
              </div>
              {job.match && <span className={fitClass(job.match.fitLevel)}>{job.match.fitLevel === 'high' ? '高匹配' : job.match.fitLevel === 'medium' ? '可尝试' : job.match.fitLevel === 'low' ? '低匹配' : '拒绝'}</span>}
            </div>
            <div className="muted small" style={{ margin: '4px 0 8px' }}>
              {[job.city, job.salary, job.channel].filter(Boolean).join(' · ') || '信息待补'}
            </div>

            {job.match ? (
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <div>
                  匹配度 <b>{job.match.score}</b> 分
                </div>
                <div className="muted">{job.match.reason}</div>
                {job.match.suggestion && <div className="muted">建议：{job.match.suggestion}</div>}
              </div>
            ) : (
              <div className="muted small" style={{ marginBottom: 8 }}>
                尚未 AI 筛选
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {!job.match && (
                <button className="ghost small" disabled={filteringId === job.id} onClick={() => void handleMatch(job)}>
                  {filteringId === job.id ? (
                    <>
                      <span className="spinner" /> 筛选中
                    </>
                  ) : (
                    '🤖 AI 筛选'
                  )}
                </button>
              )}
              <button
                className="ghost small"
                disabled={composingId === job.id}
                onClick={() => void handleComposeResume(job)}
                title="从个人经历库挑选最匹配的项目，生成针对该岗位的简历版本"
              >
                {composingId === job.id ? (
                  <>
                    <span className="spinner" /> 生成中…
                  </>
                ) : (
                  '📄 针对性简历'
                )}
              </button>
              {job.match && !job.confirmed && (
                <button className="primary small" onClick={() => handleConfirm(job)}>
                  ✅ 确认投递
                </button>
              )}
              {job.confirmed && <span className="badge blue">已确认</span>}
              <button
                className="ghost small"
                onClick={() => setExpandedId(expandedId === job.id ? null : job.id)}
              >
                {expandedId === job.id ? '收起' : '详情'}
              </button>
              <button className="ghost small" onClick={() => setEditing(job)}>
                编辑
              </button>
              <button
                className="danger small"
                onClick={() => {
                  if (confirm(`确定删除「${job.company}·${job.title}」？`)) deleteJob(job.id)
                }}
              >
                删除
              </button>
            </div>

            {expandedId === job.id && (
              <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <div className="small" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  <b>JD：</b>
                  {job.jdText || '（无）'}
                </div>
                {job.notes && (
                  <div className="small" style={{ marginTop: 6 }}>
                    <b>备注：</b>
                    {job.notes}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
