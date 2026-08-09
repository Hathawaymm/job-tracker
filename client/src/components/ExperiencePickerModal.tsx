import { useEffect, useMemo, useState } from 'react'
import { getExperiences, type ExperienceItem } from '../lib/jobsApi'

interface Props {
  onClose: () => void
  onPick: (item: ExperienceItem) => void
}

/** 从经历库选择项目（弹窗）：搜索过滤 + 选中高亮 + 确认选择 */
export default function ExperiencePickerModal({ onClose, onPick }: Props) {
  const [items, setItems] = useState<ExperienceItem[]>([])
  const [err, setErr] = useState('')
  const [kw, setKw] = useState('')
  const [selId, setSelId] = useState<number | null>(null)

  useEffect(() => {
    getExperiences()
      .then(setItems)
      .catch((e) => setErr(e instanceof Error ? e.message : '加载经历库失败'))
  }, [])

  const filtered = useMemo(() => {
    const q = kw.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.company.toLowerCase().includes(q) ||
        it.role.toLowerCase().includes(q) ||
        it.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [items, kw])

  const confirm = () => {
    const hit = items.find((it) => it.id === selId)
    if (hit) onPick(hit)
  }

  return (
    <div className="preview-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="panel" style={{ width: 560, maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>从经历库选择项目</h3>
          <button className="ghost small" onClick={onClose}>✕</button>
        </div>
        <input
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          placeholder="搜索项目名称 / 公司 / 角色 / 标签…"
          style={{ marginBottom: 10 }}
          autoFocus
        />
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {err && <div className="error-box">{err}</div>}
          {filtered.length === 0 && <div className="empty">经历库为空或无匹配项</div>}
          {filtered.map((it) => (
            <div
              key={it.id}
              onClick={() => setSelId(it.id)}
              style={{
                border: selId === it.id ? '1px solid var(--blue, #3b82f6)' : '1px solid var(--border)',
                borderRadius: 6,
                padding: '8px 10px',
                marginBottom: 8,
                cursor: 'pointer',
                background: selId === it.id ? 'rgba(59,130,246,.06)' : '#fff',
              }}
            >
              <b>
                {it.company ? `${it.company}｜` : ''}
                {it.name}
              </b>
              {it.role && <span className="muted small" style={{ marginLeft: 8 }}>{it.role}</span>}
              {it.period && <span className="muted small" style={{ marginLeft: 8 }}>{it.period}</span>}
              {it.tags.length > 0 && (
                <span className="muted small" style={{ marginLeft: 8 }}>#{it.tags.join(' #')}</span>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button className="ghost small" onClick={onClose}>取消</button>
          <button className="primary small" disabled={selId === null} onClick={confirm}>
            确认选择
          </button>
        </div>
      </div>
    </div>
  )
}
