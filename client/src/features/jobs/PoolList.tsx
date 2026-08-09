import { useCallback, useEffect, useState } from 'react'
import { fitLevelFromScore, getPool, getTasks, setJobDecision, type PoolJob } from '../../lib/jobsApi'

interface Props {
  onConfirm: (job: PoolJob) => Promise<void>
  refreshKey: number
}

function fitClass(score: number): string {
  return `badge ${fitLevelFromScore(score)}`
}

function fitLabel(score: number): string {
  const l = fitLevelFromScore(score)
  return l === 'high' ? '高匹配' : l === 'medium' ? '可投递' : l === 'low' ? '低匹配' : '不建议'
}

export default function PoolList({ onConfirm, refreshKey }: Props) {
  const [pool, setPool] = useState<PoolJob[] | null>(null)
  const [err, setErr] = useState('')
  const [threshold, setThreshold] = useState(65)

  useEffect(() => {
    getTasks()
      .then((t) => setThreshold(t.config.threshold ?? 65))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    try {
      setPool(await getPool())
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载待确认池失败')
      setPool([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const handleIgnore = async (job: PoolJob) => {
    try {
      await setJobDecision(job.id, 'ignored')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '操作失败')
    }
  }

  const handleConfirm = async (job: PoolJob) => {
    try {
      await onConfirm(job)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '确认失败')
    }
  }

  if (pool === null) {
    return (
      <div className="panel">
        <span className="spinner" /> 加载待确认池…
      </div>
    )
  }

  if (pool.length === 0) {
    return (
      <div className="panel">
        <h3>待确认池（AI 推荐）</h3>
        <div className="empty">
          暂无 AI 推荐的岗位。
          <br />
          配置搜索条件后点「立即抓取」或开启定时抓取，匹配度达阈值的岗位会出现在这里，确认后进入投递清单。
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <h3>待确认池（AI 推荐 · 匹配度 {threshold}% · {pool.length} 条）</h3>
      {err && <div className="error-box">{err}</div>}
      {pool.map((job) => (
        <div key={job.id} className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <b>
                {job.company} · {job.title}
              </b>
              <span className={fitClass(job.match_score ?? 0)} style={{ marginLeft: 8 }}>
                {job.match_score ?? 0} 分 · {fitLabel(job.match_score ?? 0)}
              </span>
            </div>
            <span className="muted small">{job.fetched_at ? new Date(job.fetched_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
          </div>
          <div className="muted small" style={{ margin: '4px 0 6px' }}>
            {[job.city, job.salary].filter(Boolean).join(' · ') || '信息待补'}
          </div>
          {job.match_reason && <div className="small" style={{ marginBottom: 8 }}>💡 {job.match_reason}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="primary small" onClick={() => void handleConfirm(job)}>
              ✅ 确认投递
            </button>
            <button className="ghost small" onClick={() => void handleIgnore(job)}>
              忽略
            </button>
            {job.url && (
              <a href={job.url} target="_blank" rel="noreferrer" className="ghost small" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                🔗 查看岗位
              </a>
            )}
          </div>
          {job.jd && (
            <details style={{ marginTop: 8 }}>
              <summary className="small muted">查看 JD</summary>
              <div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{job.jd}</div>
            </details>
          )}
        </div>
      ))}
    </div>
  )
}
