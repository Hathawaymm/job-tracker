import { useState } from 'react'
import { useApp } from '../../hooks/useAppState'
import { generateGreeting } from '../../lib/ai'
import { nowIso } from '../../lib/id'
import type { Job } from '../../types'
import { ResumePicker, useResumeSelection } from '../../components/ResumePicker'

export default function GreetingPage() {
  const { state, updateJob, addLog } = useApp()
  const sel = useResumeSelection('greeting')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const targets = state.jobs.filter((j) => j.confirmed && !j.submittedAt)

  const handleGenerate = async (job: Job) => {
    setBusyId(job.id)
    setError('')
    try {
      if (!sel.version) {
        setError('没有可用的简历版本，请先在「简历」页创建')
        return
      }
      const text = await generateGreeting(sel.version.resume, job)
      updateJob(job.id, {
        greeting: { text, model: 'deepseek-v4-flash', createdAt: nowIso() },
        submittedAt: undefined,
      })
      addLog(job, '生成定制招呼语', `字数 ${text.length}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '招呼语生成失败')
    } finally {
      setBusyId(null)
    }
  }

  const handleEdit = (job: Job, text: string) => {
    updateJob(job.id, {
      greeting: { text, model: job.greeting?.model ?? 'deepseek-v4-flash', createdAt: job.greeting?.createdAt ?? nowIso() },
    })
  }

  const handleMarkSubmitted = (job: Job) => {
    updateJob(job.id, { submittedAt: nowIso() })
    addLog(job, '标记已投递', 'BOSS 已发送简历图 + 招呼语')
  }

  return (
    <div>
      <div className="info-box">
        <b>投递节奏建议：</b>
        ① 在 BOSS 直聘打开该岗位 → ② 先发送你的<b>简历图片</b> → ③ 再发送下方<b>定制招呼语</b>（不刷屏、不群发）→ ④ 完成后点击「标记已投递」，进入投递清单跟进。单个岗位闭环后再投下一个。
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <ResumePicker selection={sel} />
        <span className="muted small">招呼语基于所选简历版本生成</span>
      </div>

      {error && <div className="error-box">{error}</div>}

      {targets.length === 0 && (
        <div className="empty">
          暂无待生成招呼语的岗位。
          <br />
          请先在「岗位库」完成 AI 筛选并确认投递目标。
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 14 }}>
        {targets.map((job) => (
          <div key={job.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <b>
                  {job.company} · {job.title}
                </b>
                <span className="muted small" style={{ marginLeft: 8 }}>
                  {[job.city, job.salary, job.channel].filter(Boolean).join(' · ')}
                </span>
                {job.match && (
                  <span className={`badge ${job.match.fitLevel}`} style={{ marginLeft: 8 }}>
                    匹配度 {job.match.score} 分
                  </span>
                )}
              </div>
            </div>

            {job.greeting ? (
              <div style={{ marginTop: 10 }}>
                <div className="field">
                  <label>定制招呼语（可直接编辑）· {job.greeting.text.length} 字</label>
                  <textarea
                    value={job.greeting.text}
                    rows={4}
                    onChange={(e) => handleEdit(job, e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <button className="ghost small" disabled={busyId !== null} onClick={() => void handleGenerate(job)}>
                    🔄 重新生成
                  </button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="primary" onClick={() => handleMarkSubmitted(job)}>
                      ✅ 已投递（进清单）
                    </button>
                  </div>
                </div>
                <div className="small muted" style={{ marginTop: 8 }}>
                  投递步骤：先发简历图片 → 再发这段招呼语 → 点「已投递」
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <button className="primary" disabled={busyId !== null} onClick={() => void handleGenerate(job)}>
                  {busyId === job.id ? (
                    <>
                      <span className="spinner" /> 生成中…
                    </>
                  ) : (
                    '✨ 生成定制招呼语'
                  )}
                </button>
                <div className="muted small" style={{ marginTop: 6 }}>
                  针对该岗位 JD 与你的简历亮点量身定制
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
