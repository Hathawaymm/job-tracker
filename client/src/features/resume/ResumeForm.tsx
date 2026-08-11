import { useState, type CSSProperties } from 'react'
import type { Education, Project, Resume, WorkExperience } from '../../types'
import { starPolish } from '../../lib/ai'
import { uid } from '../../lib/id'
import EditableField from '../../components/EditableField'
import ExperiencePickerModal from '../../components/ExperiencePickerModal'
import { useDragSort } from '../../hooks/useDragSort'
import type { ExperienceItem } from '../../lib/jobsApi'

/** 拖拽把手：仅把手可拖，避免干扰点击编辑 */
function Grip({ gripProps }: { gripProps: Record<string, unknown> }) {
  return (
    <span className="grip" title="拖动排序" {...gripProps}>
      ⠿
    </span>
  )
}

interface Props {
  resume: Resume
  onChange: (r: Resume) => void
  disabled?: boolean
}

const EMPTY_EXP = (): WorkExperience => ({ id: uid(), company: '', role: '', period: '', highlights: [] })
const EMPTY_PROJECT = (): Project => ({ id: uid(), company: '', name: '', role: '', description: '', points: [] })
const EMPTY_EDU = (): Education => ({ id: uid(), school: '', major: '', degree: '', period: '' })

export default function ResumeForm({ resume, onChange, disabled }: Props) {
  const [polishing, setPolishing] = useState<string | null>(null)
  const [polishBackup, setPolishBackup] = useState<{ projectId: string; points: string[] } | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)

  const readonly = disabled ?? false

  const expSort = useDragSort<WorkExperience>({
    items: resume.experiences,
    onReorder: (next) => set({ experiences: next }),
    disabled: readonly,
  })
  const projSort = useDragSort<Project>({
    items: resume.projects,
    onReorder: (next) => set({ projects: next }),
    disabled: readonly,
  })

  const set = (patch: Partial<Resume>) => onChange({ ...resume, ...patch })

  const updateExp = (id: string, patch: Partial<WorkExperience>) =>
    set({ experiences: resume.experiences.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
  const updateProject = (id: string, patch: Partial<Project>) =>
    set({ projects: resume.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  const updateEdu = (id: string, patch: Partial<Education>) =>
    set({ education: resume.education.map((e) => (e.id === id ? { ...e, ...patch } : e)) })

  // 需求4：新增置顶（unshift）
  const addExp = () => set({ experiences: [EMPTY_EXP(), ...resume.experiences] })
  const addProject = () => set({ projects: [EMPTY_PROJECT(), ...resume.projects] })
  const addEdu = () => set({ education: [EMPTY_EDU(), ...resume.education] })

  // 需求3：润色前保存快照，润色后可回退
  const handleStar = async (p: Project) => {
    if (!p.points.some((x) => x.trim())) {
      alert('该项目还没有要点，请先填写项目要点再一键润色')
      return
    }
    setPolishing(p.id)
    setPolishBackup({ projectId: p.id, points: [...p.points] })
    try {
      const points = await starPolish(resume, { name: p.name, description: p.description, points: p.points })
      if (points.length > 0) updateProject(p.id, { points })
      else {
        alert('润色未返回结果，请重试')
        setPolishBackup(null)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '润色失败')
      setPolishBackup(null)
    } finally {
      setPolishing(null)
    }
  }

  const handleRevert = (p: Project) => {
    if (polishBackup?.projectId === p.id) {
      updateProject(p.id, { points: polishBackup.points })
      setPolishBackup(null)
    }
  }

  /** 需求：从经历库选填项目。覆盖前二次确认；填充后即普通编辑条目，不同步回经历库 */
  const handlePickFromBank = (p: Project, item: ExperienceItem) => {
    const existing = p.description.trim() || p.points.some((x) => x.trim())
    if (existing && !confirm('即将覆盖当前内容，是否继续？')) {
      setPickerFor(null)
      return
    }
    updateProject(p.id, {
      company: item.company,
      name: item.name,
      role: item.role,
      description: item.description,
      points: [...item.points],
    })
    setPickerFor(null)
  }

  /** 拖拽中/悬停时的卡片样式 */
  const cardStyle = (dragging: boolean, indicator: 'before' | 'after' | null) => {
    const style: CSSProperties = { marginBottom: 12 }
    if (dragging) style.opacity = 0.4
    if (indicator === 'before') style.borderTop = '3px solid var(--accent, #6366f1)'
    if (indicator === 'after') style.borderBottom = '3px solid var(--accent, #6366f1)'
    return style
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* 基本信息：点击字段即编辑 */}
      <div className="panel">
        <h3>基本信息</h3>
        <div className="row">
          <div className="field">
            <label>姓名</label>
            <EditableField value={resume.name} disabled={readonly} onChange={(v) => set({ name: v })} />
          </div>
          <div className="field">
            <label>求职意向</label>
            <EditableField value={resume.title} disabled={readonly} onChange={(v) => set({ title: v })} />
          </div>
          <div className="field">
            <label>城市</label>
            <EditableField value={resume.city} disabled={readonly} onChange={(v) => set({ city: v })} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>电话</label>
            <EditableField value={resume.phone} disabled={readonly} onChange={(v) => set({ phone: v })} />
          </div>
          <div className="field">
            <label>邮箱</label>
            <EditableField value={resume.email} disabled={readonly} onChange={(v) => set({ email: v })} />
          </div>
        </div>
        <div className="field">
          <label>个人简介</label>
          <EditableField value={resume.summary} multiline disabled={readonly} placeholder="用 1-2 句话概括你的定位与核心优势" onChange={(v) => set({ summary: v })} />
        </div>
        <div className="field">
          <label>技能（逗号分隔）</label>
          <EditableField
            value={resume.skills.join(', ')}
            multiline
            disabled={readonly}
            placeholder="如：PMP、项目管理、Python"
            onChange={(v) => set({ skills: v.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })}
          />
        </div>
      </div>

      {/* 工作经历：每条字段点击即编辑 */}
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>工作经历</h3>
          <button className="ghost small" disabled={readonly} onClick={addExp}>+ 添加</button>
        </div>
        {resume.experiences.length === 0 && <p className="muted small">暂无工作经历，可留空（应届生可只填项目经历）</p>}
        {resume.experiences.map((exp) => {
          const cp = expSort.cardProps(exp)
          return (
          <div
            key={exp.id}
            className="card"
            style={cardStyle(expSort.isDragging(exp.id), expSort.dropIndicator(exp.id))}
            {...cp}
          >
            <div className="row">
              <div className="field">
                <label>公司</label>
                <EditableField value={exp.company} disabled={readonly} onChange={(v) => updateExp(exp.id, { company: v })} />
              </div>
              <div className="field">
                <label>职位</label>
                <EditableField value={exp.role} disabled={readonly} onChange={(v) => updateExp(exp.id, { role: v })} />
              </div>
              <div className="field">
                <label>时间</label>
                <EditableField value={exp.period} disabled={readonly} placeholder="2022.06 - 至今" onChange={(v) => updateExp(exp.id, { period: v })} />
              </div>
              {!readonly && (
                <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-end', marginBottom: 12, alignItems: 'center' }}>
                  <button
                    className="danger small"
                    onClick={() => { if (confirm('确定删除这条工作经历？')) set({ experiences: resume.experiences.filter((x) => x.id !== exp.id) }) }}
                  >
                    删除
                  </button>
                  <Grip gripProps={expSort.gripProps(exp)} />
                </div>
              )}
            </div>
            <div className="field">
              <label>职责亮点（每行一条，建议含量化结果）</label>
              <EditableField
                value={exp.highlights.join('\n')}
                multiline
                disabled={readonly}
                onChange={(v) => updateExp(exp.id, { highlights: v.split('\n') })}
              />
            </div>
          </div>
          )
        })}
      </div>

      {/* 项目经历：每条字段点击即编辑 + 润色回退 */}
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>项目经历</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ghost small" disabled={readonly} onClick={() => setPickerFor('__new__')}>📥 从经历库选择</button>
            <button className="ghost small" disabled={readonly} onClick={addProject}>+ 添加</button>
          </div>
        </div>
        {resume.projects.map((p) => {
          const cp = projSort.cardProps(p)
          return (
          <div
            key={p.id}
            className="card"
            style={cardStyle(projSort.isDragging(p.id), projSort.dropIndicator(p.id))}
            {...cp}
          >
            <div className="row">
              <div className="field">
                <label>公司</label>
                <EditableField value={p.company} disabled={readonly} placeholder="所属公司（可留空）" onChange={(v) => updateProject(p.id, { company: v })} />
              </div>
              <div className="field">
                <label>项目名称</label>
                <EditableField value={p.name} disabled={readonly} onChange={(v) => updateProject(p.id, { name: v })} />
              </div>
              <div className="field">
                <label>担任角色</label>
                <EditableField value={p.role} disabled={readonly} onChange={(v) => updateProject(p.id, { role: v })} />
              </div>
              {!readonly && (
                <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-end', marginBottom: 12 }}>
                  <button className="ghost small" onClick={() => setPickerFor(p.id)}>📥 选填</button>
                  <button
                    className="danger small"
                    onClick={() => { if (confirm('确定删除这条项目经历？')) set({ projects: resume.projects.filter((x) => x.id !== p.id) }) }}
                  >
                    删除
                  </button>
                </div>
              )}
            </div>
            <div className="field">
              <label>项目简介</label>
              <EditableField value={p.description} multiline disabled={readonly} onChange={(v) => updateProject(p.id, { description: v })} />
            </div>
            <div className="field">
              <label>项目要点（每行一条）</label>
              <EditableField
                value={p.points.join('\n')}
                multiline
                disabled={readonly || polishing === p.id}
                placeholder="一行一条要点，如：负责 XX 模块开发，日活从 1w 提升到 3w"
                onChange={(v) => updateProject(p.id, { points: v.split('\n') })}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
              {polishBackup?.projectId === p.id && (
                <span className="muted small">已保留润色前版本</span>
              )}
              {polishBackup?.projectId === p.id && (
                <button className="ghost small" onClick={() => handleRevert(p)}>↩ 回退</button>
              )}
              <button className="primary small" disabled={readonly || polishing !== null} onClick={() => void handleStar(p)}>
                {polishing === p.id ? <><span className="spinner" /> STAR 润色中…</> : '✨ 一键 STAR 润色'}
              </button>
              {!readonly && <Grip gripProps={projSort.gripProps(p)} />}
            </div>
          </div>
          )
        })}
      </div>

      {/* 教育经历：每条字段点击即编辑 */}
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>教育经历</h3>
          <button className="ghost small" disabled={readonly} onClick={addEdu}>+ 添加</button>
        </div>
        {resume.education.map((ed) => (
          <div key={ed.id} className="card" style={{ marginBottom: 12 }}>
            <div className="row">
              <div className="field">
                <label>学校</label>
                <EditableField value={ed.school} disabled={readonly} onChange={(v) => updateEdu(ed.id, { school: v })} />
              </div>
              <div className="field">
                <label>专业</label>
                <EditableField value={ed.major} disabled={readonly} onChange={(v) => updateEdu(ed.id, { major: v })} />
              </div>
              <div className="field">
                <label>学历</label>
                <EditableField value={ed.degree} disabled={readonly} onChange={(v) => updateEdu(ed.id, { degree: v })} />
              </div>
              <div className="field">
                <label>时间</label>
                <EditableField value={ed.period} disabled={readonly} onChange={(v) => updateEdu(ed.id, { period: v })} />
              </div>
              {!readonly && (
                <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-end', marginBottom: 12 }}>
                  <button
                    className="danger small"
                    onClick={() => { if (confirm('确定删除这条教育经历？')) set({ education: resume.education.filter((x) => x.id !== ed.id) }) }}
                  >
                    删除
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {pickerFor !== null && (
        <ExperiencePickerModal
          onClose={() => setPickerFor(null)}
            onPick={(item) => {
              if (pickerFor === '__new__') {
                set({
                  projects: [
                    {
                      id: uid(),
                      company: item.company,
                      name: item.name,
                      role: item.role,
                      description: item.description,
                      points: [...item.points],
                    },
                    ...resume.projects,
                  ],
                })
              } else {
                const target = resume.projects.find((p) => p.id === pickerFor)
                if (target) handlePickFromBank(target, item)
              }
              setPickerFor(null)
            }}
        />
      )}
    </div>
  )
}
