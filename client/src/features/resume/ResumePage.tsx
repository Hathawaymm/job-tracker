import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../hooks/useAppState'
import { diagnoseResume, generateResumeFromBank, optimizeResume } from '../../lib/ai'
import { importResumeFile, detectResumeFileType } from '../../lib/resumeImport'
import { mergeExtractedResume, type DiagnoseResult } from '../../lib/scoring'
import { emptyResume, saveResumes } from '../../lib/storage'
import type { Resume, ResumeVersion } from '../../types'
import { getExperiences, getResumeFromBank, saveAppState } from '../../lib/jobsApi'
import ResumeForm from './ResumeForm'
import ResumePreview from './ResumePreview'
import JdPickerModal from '../../components/JdPickerModal'

const BUSY_LABEL: Record<string, string> = {
  import_pdf: '解析 PDF…',
  import_docx: '提取 Word…',
  import_markdown: '解析 Markdown…',
  import_image: '识图导入…',
}

export default function ResumePage({ initialResumeId }: { initialResumeId?: string }) {
  const { state, updateResumeVersion, addResumeVersion, deleteResumeVersion, duplicateResumeVersion } = useApp()
  const resumes = state.resumes
  const [currentId, setCurrentId] = useState<string>(() => {
    if (initialResumeId && resumes.some((v) => v.id === initialResumeId)) return initialResumeId
    return resumes[0]?.id ?? ''
  })
  const [busy, setBusy] = useState('')
  const [diagnose, setDiagnose] = useState<DiagnoseResult | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [preview, setPreview] = useState<ResumeVersion | null>(null)
  const [optimizing, setOptimizing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [jdPicker, setJdPicker] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<number | null>(null)

  // 版本增删后校正当前编辑版本
  useEffect(() => {
    setCurrentId((prev) => (prev && resumes.some((v) => v.id === prev) ? prev : resumes[0]?.id ?? ''))
  }, [resumes])

  const current = resumes.find((v) => v.id === currentId) ?? resumes[0] ?? null

  const showToast = (type: 'ok' | 'err', text: string) => {
    setToast({ type, text })
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3000)
  }

  const promptName = (hint: string): string | null => {
    const name = window.prompt(`请输入简历版本名称（${hint}）`, '')
    return name === null ? null : name.trim() || '未命名版本'
  }

  const handleSave = async () => {
    try {
      await saveAppState(state)
      saveResumes(state.resumes)
      showToast('ok', '保存成功 🏅')
    } catch {
      saveResumes(state.resumes)
      showToast('ok', '已保存到本地')
    }
  }

  const handleNew = () => {
    const name = promptName('新建空白简历')
    if (name === null) return
    const id = addResumeVersion(name, emptyResume())
    setCurrentId(id)
    setDiagnose(null)
    showToast('ok', `已创建版本「${name}」`)
  }

  const handleImport = async (file: File) => {
    const type = detectResumeFileType(file)
    setBusy(type === 'pdf' ? 'import_pdf' : type === 'docx' ? 'import_docx' : type === 'markdown' ? 'import_markdown' : 'import_image')
    setError('')
    setDone('')
    try {
      const ext = await importResumeFile(file)
      const merged = mergeExtractedResume(emptyResume(), ext)
      const name = promptName('导入的简历')
      if (name === null) {
        showToast('err', '已取消导入（未填写名称）')
        return
      }
      const id = addResumeVersion(name, merged)
      setCurrentId(id)
      setDiagnose(null)
      showToast('ok', `已导入为版本「${name}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '简历导入失败')
    } finally {
      setBusy('')
    }
  }

  const handleDuplicate = () => {
    if (!current) return
    const name = promptName(`复制「${current.name}」`)
    if (name === null) return
    const id = duplicateResumeVersion(current.id, name)
    setCurrentId(id)
    showToast('ok', `已复制为「${name}」`)
  }

  const handleDelete = () => {
    if (!current) return
    if (!window.confirm(`确定删除简历版本「${current.name}」？`)) return
    deleteResumeVersion(current.id)
    showToast('ok', `已删除「${current.name}」`)
  }

  const handleDiagnose = async () => {
    if (!current) return
    const resume = current.resume
    if (!resume.name && resume.projects.length === 0 && !resume.summary) {
      alert('该版本简历内容为空，请先填写或导入')
      return
    }
    setBusy('diagnose')
    setError('')
    setDone('')
    try {
      setDiagnose(await diagnoseResume(resume))
      setDone('诊断完成')
    } catch (err) {
      setError(err instanceof Error ? err.message : '诊断失败')
    } finally {
      setBusy('')
    }
  }

  // 需求1：基于诊断结果整份优化，生成新版本「AI-原名」
  const handleOptimize = async () => {
    if (!current || !diagnose) return
    setOptimizing(true)
    setError('')
    setDone('')
    try {
      const ext = await optimizeResume(current.resume, diagnose)
      const optimized = mergeExtractedResume(current.resume, ext)
      const newName = `AI-${current.name}`
      const id = addResumeVersion(newName, optimized)
      setCurrentId(id)
      setDiagnose(null)
      showToast('ok', `已生成优化版本「${newName}」，可编辑后保存；原版本已保留`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '简历优化失败')
    } finally {
      setOptimizing(false)
    }
  }

  // 需求2：基于经历库全量 + 目标岗位 JD，AI 生成定制简历（工作/教育/基础信息继承当前简历）
  const handleGenerateFromBank = async (jd: string, src: { company: string; title: string }) => {
    if (!current) return
    setJdPicker(false)
    setGenerating(true)
    setError('')
    setDone('')
    try {
      const items = await getExperiences()
      if (items.length === 0) {
        setError('个人经历库为空，请先到「个人经历库」页录入项目经历')
        return
      }
      const bankResume = await getResumeFromBank()
      const ext = await generateResumeFromBank(jd, items, bankResume)
      const merged = mergeExtractedResume(bankResume, ext)
      const base = src.company && src.title ? `${src.title}-${src.company}` : src.title || '粘贴JD'
      const name = `AI-${base}-${new Date().toISOString().slice(0, 10)}`
      const id = addResumeVersion(name, merged)
      setCurrentId(id)
      showToast('ok', `已生成定制简历「${name}」，可编辑后保存；原版本已保留`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 生成简历失败')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.text}</div>}

      <div className="panel">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            简历版本
            <select value={current?.id ?? ''} onChange={(e) => setCurrentId(e.target.value)} style={{ width: 'auto' }}>
              {resumes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <button className="ghost small" disabled={busy !== ''} onClick={handleNew}>
            + 新建
          </button>
          <button className="ghost small" disabled={busy !== ''} onClick={() => fileRef.current?.click()}>
            {busy.startsWith('import') ? (
              <>
                <span className="spinner" /> {BUSY_LABEL[busy]}
              </>
            ) : (
              '📄 上传导入'
            )}
          </button>
          <button className="ghost small" disabled={!current} onClick={handleDuplicate}>
            复制
          </button>
          <button className="danger small" disabled={!current || resumes.length <= 1} onClick={handleDelete}>
            删除
          </button>
          <span style={{ flex: 1 }} />
          <button className="primary" disabled={busy !== ''} onClick={handleSave}>
            💾 保存简历
          </button>
          <button className="ghost" disabled={!current} title="导出当前简历版本为 Markdown / Word / PDF" onClick={() => current && setPreview(current)}>
            📄 导出
          </button>
          <button className="ghost" disabled={busy === 'diagnose'} onClick={() => void handleDiagnose()}>
            {busy === 'diagnose' ? <><span className="spinner" /> 诊断中…</> : '🔍 AI 诊断'}
          </button>
          <button className="ghost" disabled={!current || generating} onClick={() => current && setJdPicker(true)}>
            {generating ? <><span className="spinner" /> 生成中…</> : '✨ AI 生成简历'}
          </button>
        </div>
        <div className="small muted" style={{ marginTop: 8 }}>
          简历为手动保存，编辑后请点「保存」；上传/新建/复制会生成新版本，可切换编辑，各功能页可选用不同版本。
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.md,.markdown,.png,.jpg,.jpeg,.webp,image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleImport(f)
            e.target.value = ''
          }}
        />
        {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}
        {done && <div className="info-box" style={{ marginTop: 10 }}>{done}</div>}
      </div>

      {current ? (
        <>
          {diagnose && (
            <div className="panel">
              <h3>AI 诊断结果（{current.name}）</h3>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                <div>
                  <h4 style={{ color: 'var(--green)', margin: '0 0 6px' }}>亮点</h4>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {diagnose.highlights.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 style={{ color: 'var(--red)', margin: '0 0 6px' }}>不足</h4>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {diagnose.weaknesses.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 style={{ color: 'var(--amber)', margin: '0 0 6px' }}>改进建议</h4>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {diagnose.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button className="primary" disabled={optimizing} onClick={() => void handleOptimize()}>
                  {optimizing ? (
                    <>
                      <span className="spinner" /> 优化生成中…
                    </>
                  ) : (
                    '✨ 基于诊断生成优化简历'
                  )}
                </button>
                <span className="muted small">将生成新版本「AI-{current.name}」并自动切换编辑，原版本保留可对比</span>
              </div>
            </div>
          )}
          <ResumeForm
            key={current.id}
            resume={current.resume}
            disabled={busy !== ''}
            onChange={(r: Resume) => updateResumeVersion(current.id, r)}
          />
        </>
      ) : (
        <div className="empty">暂无简历，点击「新建」或「上传导入」</div>
      )}

      {preview && <ResumePreview version={preview} onClose={() => setPreview(null)} />}

      {jdPicker && (
        <JdPickerModal jobs={state.jobs} onClose={() => setJdPicker(false)} onPick={(jd, src) => void handleGenerateFromBank(jd, src)} />
      )}
    </div>
  )
}
