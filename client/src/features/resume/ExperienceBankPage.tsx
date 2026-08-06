import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createExperience,
  deleteExperience,
  getExperiences,
  updateExperience,
  type ExperienceItem,
} from '../../lib/jobsApi'
import { ResumePicker, useResumeSelection } from '../../components/ResumePicker'
import type { ExperienceInput } from '../../lib/jobsApi'
import { importResumeFile } from '../../lib/resumeImport'
import EditableField from '../../components/EditableField'

const EMPTY_FORM = { company: '', name: '', role: '', period: '', description: '', points: '', tags: '' }

/** 把任意来源对象归一化为经历库输入（容忍缺字段） */
function normalizeInput(raw: Record<string, unknown>): ExperienceInput | null {
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return null
  return {
    company: typeof raw.company === 'string' ? raw.company : '',
    name,
    role: typeof raw.role === 'string' ? raw.role : '',
    period: typeof raw.period === 'string' ? raw.period : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    points: Array.isArray(raw.points) ? raw.points.filter((x): x is string => typeof x === 'string') : [],
    tags: Array.isArray(raw.tags) ? raw.tags.filter((x): x is string => typeof x === 'string') : [],
  }
}

export default function ExperienceBankPage() {
  const [items, setItems] = useState<ExperienceItem[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const sel = useResumeSelection('bank')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      setItems(await getExperiences())
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载经历库失败')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toast = (type: 'ok' | 'err', text: string) => {
    if (type === 'ok') {
      setDone(text)
      setErr('')
    } else {
      setErr(text)
      setDone('')
    }
  }

  const resetForm = () => {
    setForm(EMPTY_FORM)
  }

  const handleSave = async () => {
    setErr('')
    setDone('')
    const name = form.name.trim()
    if (!name) {
      setErr('项目名称不能为空')
      return
    }
    setBusy(true)
    try {
      const payload = {
        company: form.company.trim(),
        name,
        role: form.role.trim(),
        period: form.period.trim(),
        description: form.description.trim(),
        points: form.points.split('\n').map((s) => s.trim()).filter(Boolean),
        tags: form.tags.split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
      }
      await createExperience(payload)
      toast('ok', '已添加到个人经历库')
      resetForm()
      void load()
    } catch (e) {
      toast('err', e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (item: ExperienceItem) => {
    if (!confirm(`确定删除经历「${item.name}」？此操作不可恢复。`)) return
    try {
      await deleteExperience(item.id)
      void load()
      toast('ok', '已删除')
    } catch (e) {
      toast('err', e instanceof Error ? e.message : '删除失败')
    }
  }

  /** 就地编辑：乐观更新本地列表 + 后台静默保存，失败回滚 */
  const handleInlineUpdate = (id: number, patch: Partial<ExperienceInput>) => {
    const prev = items.find((it) => it.id === id)
    if (!prev) return
    const next = { ...prev, ...patch, updatedAt: new Date().toISOString() }
    setItems(items.map((it) => (it.id === id ? next : it)))
    updateExperience(id, {
      company: next.company,
      name: next.name,
      role: next.role,
      period: next.period,
      description: next.description,
      points: next.points,
      tags: next.tags,
    }).catch(() => {
      setItems(items.map((it) => (it.id === id ? prev : it)))
      toast('err', '保存失败，已还原')
    })
  }

  /** 从当前简历版本导入项目经历（按 名称+公司 去重，跳过已存在） */
  const handleImportFromResume = async () => {
    const resume = sel.version?.resume
    if (!resume || resume.projects.length === 0) {
      setErr('当前简历版本没有项目经历，请先到「简历」页填写')
      return
    }
    const existing = new Set(items.map((it) => `${it.company}|${it.name}`))
    const toImport = resume.projects
      .filter((p) => p.name.trim())
      .filter((p) => !existing.has(`${p.company.trim()}|${p.name.trim()}`))
    if (toImport.length === 0) {
      toast('ok', '该简历的项目经历已全部在经历库中，无需导入')
      return
    }
    setBusy(true)
    setErr('')
    setDone('')
    try {
      let count = 0
      for (const p of toImport) {
        await createExperience({
          company: p.company,
          name: p.name,
          role: p.role,
          period: '',
          description: p.description,
          points: p.points,
          tags: [],
        })
        count++
      }
      void load()
      toast('ok', `已从「${sel.version?.name}」导入 ${count} 条项目经历`)
    } catch (e) {
      toast('err', e instanceof Error ? e.message : '导入失败')
    } finally {
      setBusy(false)
    }
  }

  /** 从 JSON 文件导入经历库（支持 {items:[...]} 或纯数组）；Word/PDF/图片走简历解析后导入项目 */
  const handleImportFile = async (file: File) => {
    setBusy(true)
    setErr('')
    setDone('')
    try {
      let normalized: ExperienceInput[]
      const lower = file.name.toLowerCase()
      const isJson = file.name.endsWith('.json') || file.type === 'application/json'
      if (isJson) {
        const text = await file.text()
        const data = JSON.parse(text) as unknown
        const list = Array.isArray(data) ? data : (data as { items?: unknown })?.items
        if (!Array.isArray(list)) throw new Error('JSON 文件格式不正确：应为经历数组或 {"items":[...]}')
        normalized = list
          .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
          .map((x) => normalizeInput(x))
          .filter((x): x is ExperienceInput => x !== null)
      } else if (
        lower.endsWith('.pdf') ||
        lower.endsWith('.docx') ||
        lower.endsWith('.md') ||
        lower.endsWith('.markdown') ||
        /\.(png|jpe?g|webp|bmp)$/.test(lower) ||
        file.type.startsWith('image/')
      ) {
        // 复用简历导入链路：解析 Word/PDF/Markdown/图片 → 提取结构化简历 → 取项目经历
        const ext = await importResumeFile(file)
        const projects = ext.projects ?? []
        normalized = projects
          .filter((p) => (p.name ?? '').trim())
          .map((p) =>
            normalizeInput({
              company: p.company ?? '',
              name: p.name ?? '',
              role: p.role ?? '',
              description: p.description ?? '',
              points: p.points ?? [],
              tags: [],
            } as Record<string, unknown>),
          )
          .filter((x): x is ExperienceInput => x !== null)
        if (normalized.length === 0) throw new Error('未能从文档中识别到项目经历，请检查文件内容或改用 JSON 导入')
      } else {
        throw new Error('暂不支持该格式，请使用 PDF、Word（.docx）、Markdown、图片或 JSON 文件')
      }
      if (normalized.length === 0) throw new Error('文件中没有可导入的项目经历')
      const existing = new Set(items.map((it) => `${it.company}|${it.name}`))
      let count = 0
      for (const n of normalized) {
        if (existing.has(`${n.company}|${n.name}`)) continue
        await createExperience(n)
        existing.add(`${n.company}|${n.name}`)
        count++
      }
      void load()
      toast('ok', `已从文件导入 ${count} 条项目经历（跳过 ${normalized.length - count} 条重复）`)
    } catch (e) {
      toast('err', e instanceof Error ? e.message : '文件导入失败')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div>
      <div className="panel">
        <h3>➕ 新增项目经历</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <ResumePicker selection={sel} />
          <button className="ghost small" disabled={busy} onClick={() => void handleImportFromResume()}>
            📥 从简历导入项目
          </button>
          <button className="ghost small" disabled={busy} onClick={() => fileRef.current?.click()}>
            📂 从文件导入
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json,.pdf,application/pdf,.docx,.md,.markdown,image/*,.png,.jpg,.jpeg,.webp"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleImportFile(f)
            }}
          />
        </div>
        <div className="muted small" style={{ marginBottom: 10 }}>
          项目经历会持久保存在本地服务器（SQLite），跨浏览器/设备不丢失。投递具体岗位时，AI 会从这里挑选最匹配的项目组装针对性简历。
          <br />
          导入：支持 Word（.docx）/ PDF / Markdown / 图片（自动识别其中的项目经历），或 JSON 文件（经历数组 / {'{"items":[...]}'} 结构）。
        </div>
        <div className="row">
          <div className="field">
            <label>项目名称 *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：订单中心自研重构" />
          </div>
          <div className="field">
            <label>公司</label>
            <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="所属公司/单位" />
          </div>
          <div className="field">
            <label>担任角色</label>
            <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="如：项目经理" />
          </div>
          <div className="field">
            <label>时间</label>
            <input value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} placeholder="2024.01 - 2024.12" />
          </div>
        </div>
        <div className="field">
          <label>项目简介</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="一句话介绍项目背景与目标" />
        </div>
        <div className="field">
          <label>项目要点（每行一条，建议含量化结果）</label>
          <textarea
            value={form.points}
            onChange={(e) => setForm({ ...form, points: e.target.value })}
            placeholder={'一行一条，如：\n· 推动 5 家 KA 客户（Walmart/Target/McKesson）系统对接上线\n· 订单处理时间从 5-10 分钟/单缩短至 1 分钟内'}
          />
        </div>
        <div className="field">
          <label>标签（逗号分隔，供 AI 匹配用）</label>
          <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="如：电商、供应链、EDI、集成" />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="primary" disabled={busy} onClick={() => void handleSave()}>
            {busy ? <><span className="spinner" /> 保存中…</> : '保存到经历库'}
          </button>
        </div>
      </div>

      {err && <div className="error-box" style={{ marginTop: 10 }}>{err}</div>}
      {done && <div className="info-box" style={{ marginTop: 10 }}>{done}</div>}

      <div className="panel" style={{ marginTop: 14 }}>
        <h3>📚 经历库（{items.length} 条）</h3>
        {items.length === 0 && (
          <div className="empty">
            暂无项目经历。建议把简历里的所有项目都录入到这里，投递时按岗位挑选。
          </div>
        )}
        {items.map((item) => (
          <div key={item.id} className="card" style={{ marginBottom: 12 }}>
            <div className="row" style={{ gap: 12 }}>
              <div className="field" style={{ flex: 1.4 }}>
                <label>项目名称</label>
                <EditableField
                  value={item.name}
                  disabled={busy}
                  onChange={(v) => handleInlineUpdate(item.id, { name: v })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>公司</label>
                <EditableField
                  value={item.company}
                  disabled={busy}
                  placeholder="所属公司"
                  onChange={(v) => handleInlineUpdate(item.id, { company: v })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>担任角色</label>
                <EditableField
                  value={item.role}
                  disabled={busy}
                  onChange={(v) => handleInlineUpdate(item.id, { role: v })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>时间</label>
                <EditableField
                  value={item.period}
                  disabled={busy}
                  placeholder="2024.01 - 2024.12"
                  onChange={(v) => handleInlineUpdate(item.id, { period: v })}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginBottom: 12 }}>
                <button className="danger small" onClick={() => void handleDelete(item)}>删除</button>
              </div>
            </div>
            <div className="field">
              <label>项目简介</label>
              <EditableField
                value={item.description}
                multiline
                disabled={busy}
                placeholder="一句话介绍项目背景与目标"
                onChange={(v) => handleInlineUpdate(item.id, { description: v })}
              />
            </div>
            <div className="field">
              <label>项目要点（每行一条，建议含量化结果）</label>
              <EditableField
                value={item.points.join('\n')}
                multiline
                disabled={busy}
                placeholder={'一行一条，如：\n· 推动 5 家 KA 客户（Walmart/Target/McKesson）系统对接上线\n· 订单处理时间从 5-10 分钟/单缩短至 1 分钟内'}
                onChange={(v) => handleInlineUpdate(item.id, { points: v.split('\n') })}
              />
            </div>
            <div className="field">
              <label>标签（逗号分隔，供 AI 匹配用）</label>
              <EditableField
                value={item.tags.join('、')}
                disabled={busy}
                placeholder="如：电商、供应链、EDI、集成"
                onChange={(v) =>
                  handleInlineUpdate(item.id, { tags: v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) })
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
