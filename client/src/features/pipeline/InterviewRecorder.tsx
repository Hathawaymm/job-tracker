import { useState } from 'react'
import { INTERVIEW_RESULT_LABELS, type InterviewRecord } from '../../types'
import { uid } from '../../lib/id'

interface Props {
  jobId: string
  records: InterviewRecord[]
  onAdd: (r: InterviewRecord) => void
  onDelete: (id: string) => void
}

const ROUND_OPTIONS = ['一面', '二面', '三面', '技术面', 'HR面', '笔试', '其他']

export default function InterviewRecorder({ jobId, records, onAdd, onDelete }: Props) {
  const [open, setOpen] = useState(false)
  const [round, setRound] = useState('一面')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [content, setContent] = useState('')
  const [review, setReview] = useState('')
  const [result, setResult] = useState<InterviewRecord['result']>('pending')

  const submit = () => {
    onAdd({
      id: uid(),
      jobId,
      round: round.trim() || '一面',
      date,
      content,
      review,
      result,
    })
    setContent('')
    setReview('')
    setOpen(false)
  }

  return (
    <div>
      <button className="ghost small" onClick={() => setOpen((v) => !v)}>
        {open ? '收起' : '+ 添加面试记录'}
      </button>

      {open && (
        <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
          <div className="row">
            <div className="field">
              <label>轮次</label>
              <select value={round} onChange={(e) => setRound(e.target.value)}>
                {ROUND_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>日期</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label>结果</label>
              <select value={result} onChange={(e) => setResult(e.target.value as InterviewRecord['result'])}>
                {(Object.keys(INTERVIEW_RESULT_LABELS) as Array<InterviewRecord['result']>).map((k) => (
                  <option key={k} value={k}>
                    {INTERVIEW_RESULT_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>面试内容（问了哪些问题 / 考察点）</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
          <div className="field">
            <label>复盘（表现如何 / 待改进）</label>
            <textarea value={review} onChange={(e) => setReview(e.target.value)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="ghost small" onClick={() => setOpen(false)}>
              取消
            </button>
            <button className="primary small" onClick={submit}>
              保存记录
            </button>
          </div>
        </div>
      )}

      {records.map((r) => (
        <div key={r.id} className="card" style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div className="small" style={{ fontWeight: 600 }}>
              {r.round} · {r.date}
              <span className="muted" style={{ marginLeft: 8, fontWeight: 400 }}>
                {INTERVIEW_RESULT_LABELS[r.result]}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="danger small"
                onClick={() => {
                  if (confirm('删除这条面试记录？')) onDelete(r.id)
                }}
              >
                删除
              </button>
            </div>
          </div>
          {r.content && (
            <div className="small" style={{ marginTop: 6 }}>
              <b>内容：</b>
              {r.content}
            </div>
          )}
          {r.review && (
            <div className="small muted" style={{ marginTop: 4 }}>
              <b>复盘：</b>
              {r.review}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
