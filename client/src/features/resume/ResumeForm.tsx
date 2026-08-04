import { useState } from 'react'
import type { Education, Project, Resume, WorkExperience } from '../../types'
import { starPolish } from '../../lib/ai'
import { uid } from '../../lib/id'

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
  const set = (patch: Partial<Resume>) => onChange({ ...resume, ...patch })

  const updateExp = (id: string, patch: Partial<WorkExperience>) =>
    set({ experiences: resume.experiences.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
  const updateProject = (id: string, patch: Partial<Project>) =>
    set({ projects: resume.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  const updateEdu = (id: string, patch: Partial<Education>) =>
    set({ education: resume.education.map((e) => (e.id === id ? { ...e, ...patch } : e)) })

  const handleStar = async (p: Project) => {
    if (!p.points.some((x) => x.trim())) {
      alert('该项目还没有要点，请先填写项目要点再一键润色')
      return
    }
    setPolishing(p.id)
    try {
      const points = await starPolish(resume, { name: p.name, description: p.description, points: p.points })
      if (points.length > 0) updateProject(p.id, { points })
      else alert('润色未返回结果，请重试')
    } catch (err) {
      alert(err instanceof Error ? err.message : '润色失败')
    } finally {
      setPolishing(null)
    }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <h3>基本信息</h3>
        <div className="row">
          <div className="field">
            <label>姓名</label>
            <input value={resume.name} disabled={disabled} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="field">
            <label>求职意向</label>
            <input value={resume.title} disabled={disabled} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="field">
            <label>城市</label>
            <input value={resume.city} disabled={disabled} onChange={(e) => set({ city: e.target.value })} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>电话</label>
            <input value={resume.phone} disabled={disabled} onChange={(e) => set({ phone: e.target.value })} />
          </div>
          <div className="field">
            <label>邮箱</label>
            <input value={resume.email} disabled={disabled} onChange={(e) => set({ email: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>个人简介</label>
          <textarea
            value={resume.summary}
            disabled={disabled}
            placeholder="用 1-2 句话概括你的定位与核心优势"
            onChange={(e) => set({ summary: e.target.value })}
          />
        </div>
        <div className="field">
          <label>技能（逗号分隔）</label>
          <textarea
            value={resume.skills.join(', ')}
            disabled={disabled}
            onChange={(e) =>
              set({ skills: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })
            }
          />
        </div>
      </div>

      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>工作经历</h3>
          <button className="ghost small" disabled={disabled} onClick={() => set({ experiences: [...resume.experiences, EMPTY_EXP()] })}>
            + 添加
          </button>
        </div>
        {resume.experiences.length === 0 && <p className="muted small">暂无工作经历，可留空（应届生可只填项目经历）</p>}
        {resume.experiences.map((exp) => (
          <div key={exp.id} className="card" style={{ marginBottom: 12 }}>
            <div className="row">
              <div className="field">
                <label>公司</label>
                <input value={exp.company} disabled={disabled} onChange={(e) => updateExp(exp.id, { company: e.target.value })} />
              </div>
              <div className="field">
                <label>职位</label>
                <input value={exp.role} disabled={disabled} onChange={(e) => updateExp(exp.id, { role: e.target.value })} />
              </div>
              <div className="field">
                <label>时间</label>
                <input value={exp.period} disabled={disabled} placeholder="2022.06 - 至今" onChange={(e) => updateExp(exp.id, { period: e.target.value })} />
              </div>
              <button
                className="danger small"
                disabled={disabled}
                style={{ alignSelf: 'flex-end', marginBottom: 12 }}
                onClick={() => set({ experiences: resume.experiences.filter((x) => x.id !== exp.id) })}
              >
                删除
              </button>
            </div>
            <div className="field">
              <label>职责亮点（每行一条，建议含量化结果）</label>
              <textarea
                value={exp.highlights.join('\n')}
                disabled={disabled}
                onChange={(e) => updateExp(exp.id, { highlights: e.target.value.split('\n') })}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>项目经历</h3>
          <button className="ghost small" disabled={disabled} onClick={() => set({ projects: [...resume.projects, EMPTY_PROJECT()] })}>
            + 添加
          </button>
        </div>
        {resume.projects.map((p) => (
          <div key={p.id} className="card" style={{ marginBottom: 12 }}>
            <div className="row">
              <div className="field">
                <label>公司</label>
                <input value={p.company} disabled={disabled} placeholder="所属公司（可留空）" onChange={(e) => updateProject(p.id, { company: e.target.value })} />
              </div>
              <div className="field">
                <label>项目名称</label>
                <input value={p.name} disabled={disabled} onChange={(e) => updateProject(p.id, { name: e.target.value })} />
              </div>
              <div className="field">
                <label>担任角色</label>
                <input value={p.role} disabled={disabled} onChange={(e) => updateProject(p.id, { role: e.target.value })} />
              </div>
              <button
                className="danger small"
                disabled={disabled}
                style={{ alignSelf: 'flex-end', marginBottom: 12 }}
                onClick={() => set({ projects: resume.projects.filter((x) => x.id !== p.id) })}
              >
                删除
              </button>
            </div>
            <div className="field">
              <label>项目简介</label>
              <textarea value={p.description} disabled={disabled} onChange={(e) => updateProject(p.id, { description: e.target.value })} />
            </div>
            <div className="field">
              <label>项目要点（每行一条）</label>
              <textarea
                value={p.points.join('\n')}
                disabled={disabled || polishing === p.id}
                placeholder="一行一条要点，如：负责 XX 模块开发，日活从 1w 提升到 3w"
                onChange={(e) => updateProject(p.id, { points: e.target.value.split('\n') })}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="primary small" disabled={disabled || polishing !== null} onClick={() => void handleStar(p)}>
                {polishing === p.id ? <><span className="spinner" /> STAR 润色中…</> : '✨ 一键 STAR 润色'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>教育经历</h3>
          <button className="ghost small" disabled={disabled} onClick={() => set({ education: [...resume.education, EMPTY_EDU()] })}>
            + 添加
          </button>
        </div>
        {resume.education.map((ed) => (
          <div key={ed.id} className="card" style={{ marginBottom: 12 }}>
            <div className="row">
              <div className="field">
                <label>学校</label>
                <input value={ed.school} disabled={disabled} onChange={(e) => updateEdu(ed.id, { school: e.target.value })} />
              </div>
              <div className="field">
                <label>专业</label>
                <input value={ed.major} disabled={disabled} onChange={(e) => updateEdu(ed.id, { major: e.target.value })} />
              </div>
              <div className="field">
                <label>学历</label>
                <input value={ed.degree} disabled={disabled} onChange={(e) => updateEdu(ed.id, { degree: e.target.value })} />
              </div>
              <div className="field">
                <label>时间</label>
                <input value={ed.period} disabled={disabled} onChange={(e) => updateEdu(ed.id, { period: e.target.value })} />
              </div>
              <button
                className="danger small"
                disabled={disabled}
                style={{ alignSelf: 'flex-end', marginBottom: 12 }}
                onClick={() => set({ education: resume.education.filter((x) => x.id !== ed.id) })}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
