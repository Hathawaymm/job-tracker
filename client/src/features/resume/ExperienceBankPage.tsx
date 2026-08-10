import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createExperience,
  deleteExperience,
  getExperiences,
  getResumeFromBank,
  updateExperience,
  type ExperienceInput,
  type ExperienceItem,
  type ExperienceType,
} from '../../lib/jobsApi'
import { exportResumeDoc, type DocFormat } from '../../lib/exportDoc'
import { importResumeFile } from '../../lib/resumeImport'
import EditableField from '../../components/EditableField'

const TYPE_LABEL: Record<ExperienceType, string> = {
  project: '项目经历',
  work: '工作经历',
  edu: '教育经历',
  profile: '基本信息',
}

const EMPTY_FORM: Record<ExperienceType, Record<string, string>> = {
  project: { company: '', name: '', role: '', period: '', description: '', points: '', tags: '' },
  work: { company: '', name: '', role: '', period: '', highlights: '' },
  edu: { school: '', major: '', degree: '', period: '' },
  profile: { name: '', title: '', city: '', phone: '', email: '', summary: '', skills: '' },
}

/** 无 type 字段时按字段特征推断类型：有 school/major/degree → edu；有 highlights → work；有电话/邮箱/简介等个人特征 → profile；否则 project */
function inferType(raw: Record<string, unknown>): ExperienceType {
  if (typeof raw.type === 'string' && ['project', 'work', 'edu', 'profile'].includes(raw.type)) {
    return raw.type as ExperienceType
  }
  if (
    typeof raw.school === 'string' && raw.school ||
    typeof raw.major === 'string' && raw.major ||
    typeof raw.degree === 'string' && raw.degree
  ) {
    return 'edu'
  }
  if (Array.isArray(raw.highlights) && raw.highlights.length > 0) return 'work'
  if (
    typeof raw.phone === 'string' && raw.phone ||
    typeof raw.email === 'string' && raw.email ||
    typeof raw.summary === 'string' && raw.summary
  ) {
    return 'profile'
  }
  return 'project'
}

/** 把任意来源对象归一化为经历库输入（容忍缺字段） */
function normalizeInput(raw: Record<string, unknown>): ExperienceInput | null {
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return null
  return {
    type: inferType(raw),
    company: typeof raw.company === 'string' ? raw.company : '',
    name,
    role: typeof raw.role === 'string' ? raw.role : '',
    period: typeof raw.period === 'string' ? raw.period : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    points: Array.isArray(raw.points) ? raw.points.filter((x): x is string => typeof x === 'string') : [],
    tags: Array.isArray(raw.tags) ? raw.tags.filter((x): x is string => typeof x === 'string') : [],
    school: typeof raw.school === 'string' ? raw.school : '',
    major: typeof raw.major === 'string' ? raw.major : '',
    degree: typeof raw.degree === 'string' ? raw.degree : '',
    highlights: Array.isArray(raw.highlights) ? raw.highlights.filter((x): x is string => typeof x === 'string') : [],
    title: typeof raw.title === 'string' ? raw.title : '',
    city: typeof raw.city === 'string' ? raw.city : '',
    phone: typeof raw.phone === 'string' ? raw.phone : '',
    email: typeof raw.email === 'string' ? raw.email : '',
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    skills: Array.isArray(raw.skills) ? raw.skills.filter((x): x is string => typeof x === 'string') : [],
  }
}

/** 表单字段 → ExperienceInput（含 type） */
function formToInput(type: ExperienceType, f: Record<string, string>): ExperienceInput {
  const base: ExperienceInput = {
    type,
    company: '',
    name: '',
    role: '',
    period: '',
    description: '',
    points: [],
    tags: [],
    school: '',
    major: '',
    degree: '',
    highlights: [],
    title: '',
    city: '',
    phone: '',
    email: '',
    summary: '',
    skills: [],
  }
  switch (type) {
    case 'project':
      return {
        ...base,
        company: f.company?.trim() ?? '',
        name: f.name?.trim() ?? '',
        role: f.role?.trim() ?? '',
        period: f.period?.trim() ?? '',
        description: f.description?.trim() ?? '',
        points: (f.points ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
        tags: (f.tags ?? '').split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
      }
    case 'work':
      return {
        ...base,
        company: f.company?.trim() ?? '',
        name: f.name?.trim() ?? '',
        role: f.role?.trim() ?? '',
        period: f.period?.trim() ?? '',
        highlights: (f.highlights ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
      }
    case 'edu':
      return {
        ...base,
        name: f.school?.trim() ?? '',
        school: f.school?.trim() ?? '',
        major: f.major?.trim() ?? '',
        degree: f.degree?.trim() ?? '',
        period: f.period?.trim() ?? '',
      }
    case 'profile':
      return {
        ...base,
        name: f.name?.trim() ?? '',
        title: f.title?.trim() ?? '',
        city: f.city?.trim() ?? '',
        phone: f.phone?.trim() ?? '',
        email: f.email?.trim() ?? '',
        summary: f.summary?.trim() ?? '',
        skills: (f.skills ?? '').split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
      }
  }
}

/** 新增表单：按类型渲染对应字段 */
function AddForm({
  type,
  value,
  onChange,
  onSave,
  busy,
}: {
  type: ExperienceType
  value: Record<string, string>
  onChange: (v: Record<string, string>) => void
  onSave: () => void
  busy: boolean
}) {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v })
  const field = (label: string, k: string, ph: string, flex = 1) => (
    <div className="field" style={{ flex }}>
      <label>{label}</label>
      <input value={value[k] ?? ''} onChange={(e) => set(k, e.target.value)} placeholder={ph} />
    </div>
  )
  return (
    <div className="row" style={{ flexWrap: 'wrap' }}>
      {type === 'project' && (
        <>
          {field('项目名称 *', 'name', '如：订单中心自研重构', 1.4)}
          {field('公司', 'company', '所属公司/单位')}
          {field('担任角色', 'role', '如：项目经理')}
          {field('时间', 'period', '2024.01 - 2024.12')}
          <div className="field" style={{ flexBasis: '100%' }}>
            <label>项目简介</label>
            <textarea value={value.description ?? ''} onChange={(e) => set('description', e.target.value)} rows={2} placeholder="一句话介绍项目背景与目标" />
          </div>
          <div className="field" style={{ flexBasis: '100%' }}>
            <label>项目要点（每行一条，建议含量化结果）</label>
            <textarea value={value.points ?? ''} onChange={(e) => set('points', e.target.value)} rows={3} placeholder="一行一条要点，如：\n· 推动 5 家 KA 客户系统对接上线" />
          </div>
          {field('标签（逗号分隔，供 AI 匹配用）', 'tags', '如：电商、供应链、EDI、集成')}
        </>
      )}
      {type === 'work' && (
        <>
          {field('公司 *', 'company', '公司/单位', 1.2)}
          {field('职位 *', 'name', '如：项目经理')}
          {field('时间', 'period', '2022.06 - 至今')}
          <div className="field" style={{ flexBasis: '100%' }}>
            <label>职责亮点（每行一条，建议含量化结果）</label>
            <textarea value={value.highlights ?? ''} onChange={(e) => set('highlights', e.target.value)} rows={3} placeholder="每行一条职责亮点" />
          </div>
        </>
      )}
      {type === 'edu' && (
        <>
          {field('学校 *', 'school', '学校名称', 1.2)}
          {field('专业', 'major', '专业')}
          {field('学历', 'degree', '如：本科 / 硕士')}
          {field('时间', 'period', '2018.09 - 2021.07')}
        </>
      )}
      {type === 'profile' && (
        <>
          {field('姓名 *', 'name', '姓名')}
          {field('求职意向', 'title', '如：项目经理')}
          {field('城市', 'city', '城市')}
          {field('电话', 'phone', '电话')}
          {field('邮箱', 'email', '邮箱')}
          <div className="field" style={{ flexBasis: '100%' }}>
            <label>个人简介</label>
            <textarea value={value.summary ?? ''} onChange={(e) => set('summary', e.target.value)} rows={2} placeholder="用 1-2 句话概括你的定位与核心优势" />
          </div>
          <div className="field" style={{ flexBasis: '100%' }}>
            <label>技能（逗号分隔）</label>
            <textarea value={value.skills ?? ''} onChange={(e) => set('skills', e.target.value)} rows={2} placeholder="如：PMP、项目管理、Python" />
          </div>
        </>
      )}
      <div style={{ flexBasis: '100%', display: 'flex', gap: 8 }}>
        <button className="primary small" disabled={busy} onClick={onSave}>
          {busy ? <><span className="spinner" /> 保存中…</> : '保存'}
        </button>
      </div>
    </div>
  )
}

/** 经历条目就地编辑卡片：按类型渲染字段 */
function ItemCard({
  item,
  busy,
  onPatch,
  onDelete,
}: {
  item: ExperienceItem
  busy: boolean
  onPatch: (id: number, patch: Partial<ExperienceInput>) => void
  onDelete: (item: ExperienceItem) => void
}) {
  const field = (label: string, v: string, k: keyof ExperienceInput, ph = '', flex = 1, multiline = false) => (
    <div className="field" style={{ flex }}>
      <label>{label}</label>
      <EditableField
        value={v}
        multiline={multiline}
        disabled={busy}
        placeholder={ph}
        onChange={(nv) => onPatch(item.id, { [k]: nv } as Partial<ExperienceInput>)}
      />
    </div>
  )
  if (item.type === 'work') {
    return (
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 12 }}>
          {field('公司', item.company, 'company', '公司/单位', 1.2)}
          {field('职位', item.name, 'name', '职位', 1)}
          {field('时间', item.period, 'period', '2022.06 - 至今', 1)}
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginBottom: 12 }}>
            <button className="danger small" onClick={() => onDelete(item)}>删除</button>
          </div>
        </div>
        <div className="field">
          <label>职责亮点（每行一条，建议含量化结果）</label>
          <EditableField
            value={item.highlights.join('\n')}
            multiline
            disabled={busy}
            placeholder="每行一条职责亮点"
            onChange={(v) => onPatch(item.id, { highlights: v.split('\n') })}
          />
        </div>
      </div>
    )
  }
  if (item.type === 'edu') {
    return (
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 12 }}>
          {field('学校', item.name, 'name', '学校名称', 1.2)}
          {field('专业', item.major, 'major', '专业', 1)}
          {field('学历', item.degree, 'degree', '如：本科 / 硕士', 1)}
          {field('时间', item.period, 'period', '2018.09 - 2021.07', 1)}
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginBottom: 12 }}>
            <button className="danger small" onClick={() => onDelete(item)}>删除</button>
          </div>
        </div>
      </div>
    )
  }
  if (item.type === 'profile') {
    return (
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 12 }}>
          {field('姓名', item.name, 'name', '姓名', 1)}
          {field('求职意向', item.title, 'title', '如：项目经理', 1)}
          {field('城市', item.city, 'city', '城市', 1)}
          {field('电话', item.phone, 'phone', '电话', 1)}
          {field('邮箱', item.email, 'email', '邮箱', 1)}
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginBottom: 12 }}>
            <button className="danger small" onClick={() => onDelete(item)}>删除</button>
          </div>
        </div>
        <div className="field">
          <label>个人简介</label>
          <EditableField
            value={item.summary}
            multiline
            disabled={busy}
            placeholder="用 1-2 句话概括你的定位与核心优势"
            onChange={(v) => onPatch(item.id, { summary: v })}
          />
        </div>
        <div className="field">
          <label>技能（逗号分隔）</label>
          <EditableField
            value={item.skills.join('、')}
            multiline
            disabled={busy}
            placeholder="如：PMP、项目管理、Python"
            onChange={(v) => onPatch(item.id, { skills: v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) })}
          />
        </div>
      </div>
    )
  }
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ gap: 12 }}>
        {field('项目名称', item.name, 'name', '项目名称', 1.4)}
        {field('公司', item.company, 'company', '所属公司', 1)}
        {field('担任角色', item.role, 'role', '如：项目经理', 1)}
        {field('时间', item.period, 'period', '2024.01 - 2024.12', 1)}
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginBottom: 12 }}>
          <button className="danger small" onClick={() => onDelete(item)}>删除</button>
        </div>
      </div>
      <div className="field">
        <label>项目简介</label>
        <EditableField
          value={item.description}
          multiline
          disabled={busy}
          placeholder="一句话介绍项目背景与目标"
          onChange={(v) => onPatch(item.id, { description: v })}
        />
      </div>
      <div className="field">
        <label>项目要点（每行一条，建议含量化结果）</label>
        <EditableField
          value={item.points.join('\n')}
          multiline
          disabled={busy}
          placeholder="一行一条要点"
          onChange={(v) => onPatch(item.id, { points: v.split('\n') })}
        />
      </div>
      <div className="field">
        <label>标签（逗号分隔，供 AI 匹配用）</label>
        <EditableField
          value={item.tags.join('、')}
          disabled={busy}
          placeholder="如：电商、供应链、EDI、集成"
          onChange={(v) => onPatch(item.id, { tags: v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) })}
        />
      </div>
    </div>
  )
}

export default function ExperienceBankPage() {
  const [items, setItems] = useState<ExperienceItem[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')
  const [form, setForm] = useState<Record<ExperienceType, Record<string, string>>>({
    project: EMPTY_FORM.project,
    work: EMPTY_FORM.work,
    edu: EMPTY_FORM.edu,
    profile: EMPTY_FORM.profile,
  })
  const [openForm, setOpenForm] = useState<Record<ExperienceType, boolean>>({
    project: false,
    work: false,
    edu: false,
    profile: false,
  })
  const [exportFormat, setExportFormat] = useState<DocFormat>('md')
  const [exporting, setExporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      setItems(await getExperiences())
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载个人经历库失败')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toast = (ok: boolean, text: string) => {
    if (ok) {
      setDone(text)
      setErr('')
    } else {
      setErr(text)
      setDone('')
    }
  }

  const handleSave = async (type: ExperienceType) => {
    setErr('')
    setDone('')
    const f = form[type]
    const required = type === 'project' ? f.name.trim() : type === 'work' ? f.name.trim() && f.company.trim() : type === 'edu' ? f.school.trim() : f.name.trim()
    if (!required) {
      setErr(`请填写${type === 'edu' ? '学校' : type === 'work' ? '公司和职位' : type === 'profile' ? '姓名' : '项目名称'}`)
      return
    }
    setBusy(true)
    try {
      const input = formToInput(type, f)
      await createExperience(input)
      toast(true, '保存成功 🏅')
      setForm((prev) => ({ ...prev, [type]: EMPTY_FORM[type] }))
      setOpenForm((prev) => ({ ...prev, [type]: false }))
      void load()
    } catch (e) {
      toast(false, e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (item: ExperienceItem) => {
    if (!confirm(`确定删除${TYPE_LABEL[item.type]}「${item.name}」？此操作不可恢复。`)) return
    try {
      await deleteExperience(item.id)
      void load()
      toast(true, '已删除')
    } catch (e) {
      toast(false, e instanceof Error ? e.message : '删除失败')
    }
  }

  /** 就地编辑：乐观更新本地列表 + 后台静默保存，失败回滚 */
  const handleInlineUpdate = (id: number, patch: Partial<ExperienceInput>) => {
    const prev = items.find((it) => it.id === id)
    if (!prev) return
    const next = { ...prev, ...patch, updatedAt: new Date().toISOString() }
    setItems(items.map((it) => (it.id === id ? next : it)))
    updateExperience(id, { ...next })
      .catch(() => {
        setItems(items.map((it) => (it.id === id ? prev : it)))
        toast(false, '保存失败，已还原')
      })
  }

  /** 从文件导入经历库：JSON 支持多类型；Word/PDF/图片走简历解析后导入项目 */
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
              type: 'project',
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
      if (normalized.length === 0) throw new Error('文件中没有可导入的经历条目')
      const existing = new Set(items.map((it) => `${it.type}|${it.name}`))
      let count = 0
      for (const n of normalized) {
        if (existing.has(`${n.type}|${n.name}`)) continue
        await createExperience(n)
        existing.add(`${n.type}|${n.name}`)
        count++
      }
      void load()
      toast(true, `已从文件导入 ${count} 条经历（跳过 ${normalized.length - count} 条重复）`)
    } catch (e) {
      toast(false, e instanceof Error ? e.message : '文件导入失败')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const byType = (t: ExperienceType) => items.filter((x) => x.type === t)
  const profile = byType('profile')[0]

  /** 导出个人经历库（经历库聚合为 Resume 结构）为 md/Word/PDF */
  const handleExport = async () => {
    setExporting(true)
    setErr('')
    setDone('')
    try {
      const resume = await getResumeFromBank()
      await exportResumeDoc(resume, exportFormat, '个人经历库')
      setDone('已导出')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '导出失败')
    } finally {
      setExporting(false)
    }
  }

  /** 保存按钮：实时保存语义，确认提示 */
  const handleSaveConfirm = () => {
    void load()
    toast(true, '保存成功 🏅')
  }

  /** 区块标题 + 「+ 添加」按钮（基本信息区块无按钮，profile 存在时也无） */
  const sectionHead = (label: string, count: number, type?: ExperienceType) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h3 style={{ margin: 0 }}>{label}</h3>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className="muted small">{count} 条</span>
        {type && (
          <button
            className="ghost small"
            disabled={busy}
            onClick={() => {
              setForm((prev) => ({ ...prev, [type]: EMPTY_FORM[type] }))
              setOpenForm((prev) => ({ ...prev, [type]: !prev[type] }))
            }}
          >
            {openForm[type] ? '收起' : '+ 添加'}
          </button>
        )}
      </span>
    </div>
  )

  const section = (label: string, type: ExperienceType, hint: string, list: ExperienceItem[]) => (
    <div className="panel" style={{ marginTop: 12 }}>
      {sectionHead(label, list.length, type)}
      <div className="muted small" style={{ marginBottom: 10 }}>{hint}</div>
      {openForm[type] && (
        <AddForm
          type={type}
          value={form[type]}
          onChange={(v) => setForm((prev) => ({ ...prev, [type]: v }))}
          onSave={() => void handleSave(type)}
          busy={busy}
        />
      )}
      {list.map((item) => (
        <ItemCard key={item.id} item={item} busy={busy} onPatch={handleInlineUpdate} onDelete={handleDelete} />
      ))}
    </div>
  )

  return (
    <div>
      <div className="panel">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>📚 个人经历库</h3>
          <span style={{ flex: 1 }} />
          <button className="primary small" disabled={busy} onClick={handleSaveConfirm}>
            💾 保存
          </button>
          <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value as DocFormat)} style={{ width: 'auto' }} disabled={exporting}>
            <option value="md">Markdown</option>
            <option value="docx">Word</option>
            <option value="pdf">PDF</option>
          </select>
          <button className="ghost small" disabled={busy || exporting} onClick={() => void handleExport()}>
            {exporting ? <><span className="spinner" /> 导出中…</> : '📄 导出'}
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
        <div className="muted small">
          个人经历库是简历数据的单一事实来源（SSOT）：AI 生成简历时，项目/工作/教育/基本信息都从这里读取。
          <br />
          导入：JSON 文件（经历数组 / {'{"items":[...]}'} 结构，支持多类型），或 Word/PDF/Markdown/图片（自动识别其中的项目经历）。
        </div>
      </div>

      {err && <div className="error-box" style={{ marginTop: 10 }}>{err}</div>}
      {done && <div className="info-box" style={{ marginTop: 10 }}>{done}</div>}

      {/* 基本信息：单条，有则就地编辑，无则显示「新建」展开按钮 */}
      <div className="panel" style={{ marginTop: 12 }}>
        {sectionHead('基本信息', profile ? 1 : 0)}
        {profile ? (
          <ItemCard item={profile} busy={busy} onPatch={handleInlineUpdate} onDelete={handleDelete} />
        ) : (
          <>
            <div className="muted small" style={{ marginBottom: 10 }}>AI 生成简历时会自动全量带入基本信息（仅保留一条）。</div>
            <button className="ghost small" disabled={busy} onClick={() => setOpenForm((prev) => ({ ...prev, profile: !prev.profile }))}>
              {openForm.profile ? '收起' : '新建基本信息'}
            </button>
            {openForm.profile && (
              <AddForm type="profile" value={form.profile} onChange={(v) => setForm((prev) => ({ ...prev, profile: v }))} onSave={() => void handleSave('profile')} busy={busy} />
            )}
          </>
        )}
      </div>

      {section('工作经历', 'work', 'AI 生成简历时会自动全量带入工作经历。', byType('work'))}
      {section('项目经历', 'project', '投递具体岗位时，AI 会从这里挑选最匹配的项目组装针对性简历。', byType('project'))}
      {section('教育经历', 'edu', 'AI 生成简历时会自动全量带入教育经历。', byType('edu'))}
    </div>
  )
}
