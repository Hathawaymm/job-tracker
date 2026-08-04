import { useMemo, useRef, useState } from 'react'
import { useApp } from '../../hooks/useAppState'
import { visionDescribe } from '../../lib/ai'
import { jobStage } from '../../lib/jobStage'
import { fileToDataUri } from '../../lib/file'
import { nowIso } from '../../lib/id'
import { APPLICATION_STAGE_LABELS, JOB_STATUS_LABELS, type ApplicationStage, type Job } from '../../types'
import InterviewRecorder from './InterviewRecorder'

type StageFilter = 'all' | ApplicationStage

const STAGES: Array<{ key: StageFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'new', label: '待确认' },
  { key: 'confirmed', label: '已确认' },
  { key: 'greeted', label: '话术就绪' },
  { key: 'submitted', label: '已投递' },
  { key: 'active', label: '进行中' },
  { key: 'closed', label: '已结束' },
]

const FOLLOW_UP_DAYS = 3

function fmtTime(iso?: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function PipelinePage() {
  const { state, updateJob, addInterview, deleteInterview, addLog } = useApp()
  const jobs = state.jobs
  const [filter, setFilter] = useState<StageFilter>('all')
  const [imgBusy, setImgBusy] = useState(false)
  const [imgDesc, setImgDesc] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const counts = useMemo(() => {
    const c: Record<ApplicationStage, number> = { new: 0, confirmed: 0, greeted: 0, submitted: 0, active: 0, closed: 0 }
    for (const j of jobs) c[jobStage(j)] += 1
    return c
  }, [jobs])

  const nowMs = Date.now()
  const followUps = jobs.filter(
    (j) => j.submittedAt && jobStage(j) !== 'closed' && nowMs - new Date(j.updatedAt).getTime() > FOLLOW_UP_DAYS * 24 * 3600 * 1000,
  )

  const handleStatus = (job: Job, status: Job['status']) => {
    updateJob(job.id, { status })
    addLog(job, '更新状态', JOB_STATUS_LABELS[status])
  }

  const handleMarkSubmitted = (job: Job) => {
    updateJob(job.id, { submittedAt: nowIso() })
    addLog(job, '标记已投递')
  }

  const handleResumeImg = async (file: File) => {
    setImgBusy(true)
    setImgDesc('')
    try {
      const dataUri = await fileToDataUri(file)
      const desc = await visionDescribe(
        dataUri,
        '请确认这张图片是否是一份求职简历。如果是，请简述：候选人姓名、求职意向、以及最重要的 3 条经历或技能。如果不是简历，直接说明「不是简历」。',
      )
      setImgDesc(desc)
    } catch (err) {
      setImgDesc(`识别失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setImgBusy(false)
    }
  }

  const filtered = jobs.filter((j) => (filter === 'all' ? true : jobStage(j) === filter))

  return (
    <div>
      <div className="panel">
        <h3>总览</h3>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {STAGES.filter((s) => s.key !== 'all').map((s) => (
            <div key={s.key}>
              <div className="small muted">{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{counts[s.key as ApplicationStage]}</div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
          <div className="small muted" style={{ marginBottom: 6 }}>
            投递前简历图确认（GLM-4.6V 识图）：投递前上传你要发送的简历图片，AI 帮你核对内容无误再发。
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="ghost small" disabled={imgBusy} onClick={() => fileRef.current?.click()}>
              {imgBusy ? (
                <>
                  <span className="spinner" /> 识别中…
                </>
              ) : (
                '🖼 上传简历图核对'
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleResumeImg(f)
                e.target.value = ''
              }}
            />
            {imgDesc && <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{imgDesc}</div>}
          </div>
        </div>
      </div>

      {followUps.length > 0 && (
        <div className="warn-box">
          <b>待跟进提醒（已投递 {FOLLOW_UP_DAYS}+ 天未更新）：</b>
          {followUps.map((j) => (
            <span key={j.id}>
              「{j.company}·{j.title}」{fmtTime(j.updatedAt)}
              {'  '}
            </span>
          ))}
          <button className="link" onClick={() => followUps.forEach((j) => handleStatus(j, j.status))}>
            已跟进
          </button>
        </div>
      )}

      <div className="tabs" style={{ borderBottom: 'none', marginBottom: 12 }}>
        {STAGES.map((s) => (
          <button key={s.key} className={filter === s.key ? 'active' : ''} onClick={() => setFilter(s.key)}>
            {s.label} <span className="muted small">{s.key === 'all' ? jobs.length : counts[s.key as ApplicationStage]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && <div className="empty">该阶段暂无岗位</div>}

      {filtered.map((job) => (
        <div key={job.id} className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <b>
                {job.company} · {job.title}
              </b>
              <span className={`badge blue`} style={{ marginLeft: 8 }}>
                {APPLICATION_STAGE_LABELS[jobStage(job)]}
              </span>
              {job.match && (
                <span className={`badge ${job.match.fitLevel}`} style={{ marginLeft: 6 }}>
                  {job.match.score} 分
                </span>
              )}
              <span className="muted small" style={{ marginLeft: 8 }}>
                {[job.city, job.salary].filter(Boolean).join(' · ')}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="small muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                状态
                <select value={job.status} onChange={(e) => handleStatus(job, e.target.value as Job['status'])} style={{ width: 'auto' }}>
                  {(Object.keys(JOB_STATUS_LABELS) as Array<Job['status']>).map((k) => (
                    <option key={k} value={k}>
                      {JOB_STATUS_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              {!job.submittedAt && (
                <button className="primary small" onClick={() => handleMarkSubmitted(job)}>
                  标记已投
                </button>
              )}
            </div>
          </div>

          {job.greeting && (
            <div className="small muted" style={{ marginTop: 6 }}>
              话术：{job.greeting.text}
            </div>
          )}
          <div className="small muted" style={{ marginTop: 4 }}>
            投递：{fmtTime(job.submittedAt)} · 最近更新：{fmtTime(job.updatedAt)}
          </div>

          <div style={{ marginTop: 10 }}>
            <InterviewRecorder
              jobId={job.id}
              records={state.interviews.filter((r) => r.jobId === job.id)}
              onAdd={addInterview}
              onDelete={deleteInterview}
            />
          </div>
        </div>
      ))}

      <div className="panel">
        <h3>操作日志（最近 50 条）</h3>
        {state.logs.length === 0 && <div className="muted small">暂无操作记录</div>}
        <div className="small">
          {state.logs.slice(0, 50).map((log) => (
            <div key={log.id} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="muted">{fmtTime(log.at)}</span>
              {' '}
              <b>{log.action}</b> · {log.company}/{log.title}
              {log.detail && <span className="muted"> · {log.detail}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
