import { useEffect, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import type { Resume, ResumeVersion } from '../../types'

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
  const sheetRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const resume = version.resume

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const exportPng = async () => {
    if (!sheetRef.current) return
    setExporting(true)
    try {
      const canvas = await html2canvas(sheetRef.current, { scale: 2, backgroundColor: '#ffffff' })
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `${version.name || '简历'}-${new Date().toISOString().slice(0, 10)}.png`
      a.click()
    } catch (err) {
      alert(`导出图片失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExporting(false)
    }
  }

  const exportPdf = () => {
    window.print()
  }

  return (
    <div className="preview-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="preview-toolbar">
        <b>{version.name}</b>
        <span className="muted small">预览 · ESC 关闭</span>
        <span style={{ flex: 1 }} />
        <button className="primary small" disabled={exporting} onClick={() => void exportPng()}>
          {exporting ? '导出中…' : '🖼 导出图片'}
        </button>
        <button className="ghost small" onClick={exportPdf}>
          📄 导出 PDF
        </button>
        <button className="ghost small" onClick={onClose}>
          ✕ 关闭
        </button>
      </div>
      <div className="preview-scroll">
        <div className="preview-sheet" ref={sheetRef}>
          <ResumeSheet resume={resume} />
        </div>
      </div>
    </div>
  )
}
