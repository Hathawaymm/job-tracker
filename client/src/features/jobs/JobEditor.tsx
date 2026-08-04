import { useRef, useState } from 'react'
import type { Job } from '../../types'
import { visionDescribe } from '../../lib/ai'
import { fileToDataUri } from '../../lib/file'

interface Props {
  initial?: Job
  onSubmit: (data: Partial<Job>) => void
  onCancel: () => void
  submitLabel?: string
}

export default function JobEditor({ initial, onSubmit, onCancel, submitLabel = '保存岗位' }: Props) {
  const [form, setForm] = useState({
    company: initial?.company ?? '',
    title: initial?.title ?? '',
    city: initial?.city ?? '',
    salary: initial?.salary ?? '',
    channel: initial?.channel ?? 'BOSS直聘',
    url: initial?.url ?? '',
    jdText: initial?.jdText ?? '',
    notes: initial?.notes ?? '',
  })
  const [ocrBusy, setOcrBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const handleOcr = async (file: File) => {
    setOcrBusy(true)
    try {
      const dataUri = await fileToDataUri(file)
      const text = await visionDescribe(
        dataUri,
        '请完整、逐字提取这张岗位描述（JD）截图中的全部文字，保留段落与要点结构，不要遗漏职责、要求、福利任何内容。',
      )
      set({ jdText: text })
    } catch (err) {
      alert(err instanceof Error ? err.message : '截图识别失败')
    } finally {
      setOcrBusy(false)
    }
  }

  const submit = () => {
    if (!form.company.trim() || !form.title.trim()) {
      alert('请至少填写公司和职位')
      return
    }
    onSubmit({ ...form })
  }

  return (
    <div className="panel">
      <h3>{initial ? `编辑岗位：${initial.company}·${initial.title}` : '新增岗位'}</h3>
      <div className="row">
        <div className="field">
          <label>公司 *</label>
          <input value={form.company} onChange={(e) => set({ company: e.target.value })} placeholder="如：字节跳动" />
        </div>
        <div className="field">
          <label>职位 *</label>
          <input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="如：前端开发工程师" />
        </div>
        <div className="field">
          <label>城市</label>
          <input value={form.city} onChange={(e) => set({ city: e.target.value })} placeholder="如：上海" />
        </div>
        <div className="field">
          <label>薪资</label>
          <input value={form.salary} onChange={(e) => set({ salary: e.target.value })} placeholder="如：20-40K·14薪" />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>渠道</label>
          <select value={form.channel} onChange={(e) => set({ channel: e.target.value })}>
            {['BOSS直聘', '猎聘', '智联招聘', '拉勾', '内推', '其他'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>岗位链接</label>
          <input value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="可选，用于去重识别" />
        </div>
      </div>
      <div className="field">
        <label>岗位描述（JD）</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <textarea
            value={form.jdText}
            placeholder="粘贴 JD 原文，或点击右侧按钮从截图提取"
            onChange={(e) => set({ jdText: e.target.value })}
            style={{ flex: 1 }}
          />
          <button
            className="ghost small"
            style={{ alignSelf: 'flex-start', flex: '0 0 auto' }}
            disabled={ocrBusy}
            onClick={() => fileRef.current?.click()}
          >
            {ocrBusy ? (
              <>
                <span className="spinner" /> 识别中…
              </>
            ) : (
              '🖼 截图识图'
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleOcr(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>
      <div className="field">
        <label>备注</label>
        <input value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="可选" />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="ghost" onClick={onCancel}>
          取消
        </button>
        <button className="primary" onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
