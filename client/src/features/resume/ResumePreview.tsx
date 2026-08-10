import { useState } from 'react'
import type { Resume, ResumeVersion } from '../../types'
import { exportResumeDoc, type DocFormat } from '../../lib/exportDoc'

interface Props {
  version: ResumeVersion
  onClose: () => void
}

function ResumeSheet({ resume }: { resume: Resume }) {
  return (
    <div className="resume-sheet">
      <header className="rs-head">
        <h1>{resume.name || '未命名'}</h1>
        <div className="rs-title">{resume.title || '求职意向：待填写'}</div>
        <div className="rs-contact">{[resume.city, resume.phone, resume.email].filter(Boolean).join('  ·  ')}</div>
      </header>

      {resume.summary && (
        <section>
          <h2>个人简介</h2>
          <p>{resume.summary}</p>
        </section>
      )}

      {resume.skills.length > 0 && (
        <section>
          <h2>技能</h2>
          <p>{resume.skills.join(' · ')}</p>
        </section>
      )}

      {resume.experiences.length > 0 && (
        <section>
          <h2>工作经历</h2>
          {resume.experiences.map((e) => (
            <div key={e.id} className="rs-item">
              <div className="rs-item-head">
                <b>
                  {e.company}｜{e.role}
                </b>
                <span className="rs-period">{e.period}</span>
              </div>
              {e.highlights.some(Boolean) && (
                <ul>
                  {e.highlights.filter(Boolean).map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {resume.projects.length > 0 && (
        <section>
          <h2>项目经历</h2>
          {resume.projects.map((p) => (
            <div key={p.id} className="rs-item">
              <div className="rs-item-head">
                <b>
                  {[p.company, p.name].filter(Boolean).join(' · ')}
                  {p.role ? `｜${p.role}` : ''}
                </b>
              </div>
              {p.description && <div className="rs-desc">{p.description}</div>}
              {p.points.some(Boolean) && (
                <ul>
                  {p.points.filter(Boolean).map((pt, i) => (
                    <li key={i}>{pt}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {resume.education.length > 0 && (
        <section>
          <h2>教育经历</h2>
          {resume.education.map((e) => (
            <div key={e.id} className="rs-item">
              <div className="rs-item-head">
                <b>
                  {e.school}｜{e.major}｜{e.degree}
                </b>
                <span className="rs-period">{e.period}</span>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

export default function ResumePreview({ version, onClose }: Props) {
  const [format, setFormat] = useState<DocFormat>('md')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const resume = version.resume

  const handleConfirm = async () => {
    setExporting(true)
    setError('')
    try {
      await exportResumeDoc(resume, format, version.name || '简历')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="preview-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="preview-toolbar">
        <b>{version.name}</b>
        <span className="muted small">导出确认 · ESC 关闭</span>
        <span style={{ flex: 1 }} />
        <select value={format} onChange={(e) => setFormat(e.target.value as DocFormat)} style={{ width: 'auto' }} disabled={exporting}>
          <option value="md">Markdown</option>
          <option value="docx">Word</option>
          <option value="pdf">PDF</option>
        </select>
        <button className="primary small" disabled={exporting} onClick={() => void handleConfirm()}>
          {exporting ? <><span className="spinner" /> 导出中…</> : '✅ 确认导出'}
        </button>
        <button className="ghost small" disabled={exporting} onClick={onClose}>
          ✕ 取消
        </button>
      </div>
      {error && <div className="error-box" style={{ margin: 8 }}>{error}</div>}
      <div className="preview-scroll">
        <div className="preview-sheet">
          <ResumeSheet resume={resume} />
        </div>
      </div>
    </div>
  )
}
