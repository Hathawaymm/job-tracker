import { useMemo, useState } from 'react'
import type { Job } from '../types'

interface Props {
  jobs: Job[]
  onClose: () => void
  onPick: (jd: string, source: { company: string; title: string }) => void
}

/** 选择目标岗位 JD（弹窗）：岗位库有 JD 的岗位 + 手动粘贴兜底 */
export default function JdPickerModal({ jobs, onClose, onPick }: Props) {
  const [selId, setSelId] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [useManual, setUseManual] = useState(false)

  const withJd = useMemo(() => jobs.filter((j) => j.jdText.trim()), [jobs])

  const confirm = () => {
    if (useManual) {
      if (!manual.trim()) return
      onPick(manual.trim(), { company: '', title: manual.trim().slice(0, 30) })
      return
    }
    const hit = jobs.find((j) => j.id === selId)
    if (hit) onPick(hit.jdText, { company: hit.company, title: hit.title })
  }

  return (
    <div className="preview-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="panel" style={{ width: 560, maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>选择目标岗位 JD</h3>
          <button className="ghost small" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button className={`ghost small ${!useManual ? 'active' : ''}`} onClick={() => setUseManual(false)}>从岗位库选择</button>
          <button className={`ghost small ${useManual ? 'active' : ''}`} onClick={() => setUseManual(true)}>手动粘贴 JD</button>
        </div>

        {useManual ? (
          <textarea
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="粘贴岗位 JD 全文…"
            style={{ flex: 1, minHeight: 160 }}
            autoFocus
          />
        ) : (
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            {withJd.length === 0 && <div className="empty">岗位库中没有含 JD 的岗位，请切换到「手动粘贴 JD」</div>}
            {withJd.map((j) => (
              <div
                key={j.id}
                onClick={() => setSelId(j.id)}
                style={{
                  border: selId === j.id ? '1px solid var(--blue, #3b82f6)' : '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '8px 10px',
                  marginBottom: 8,
                  cursor: 'pointer',
                  background: selId === j.id ? 'rgba(59,130,246,.06)' : '#fff',
                }}
              >
                <b>
                  {j.company} · {j.title}
                </b>
                <span className="muted small" style={{ marginLeft: 8 }}>
                  {[j.city, j.salary].filter(Boolean).join(' · ')}
                </span>
                <div className="muted small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {j.jdText.slice(0, 60)}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button className="ghost small" onClick={onClose}>取消</button>
          <button
            className="primary small"
            disabled={useManual ? !manual.trim() : selId === null}
            onClick={confirm}
          >
            使用此 JD
          </button>
        </div>
      </div>
    </div>
  )
}
