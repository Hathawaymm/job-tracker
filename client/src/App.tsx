import { useEffect, useRef, useState } from 'react'
import { AppProvider, useApp } from './hooks/useAppState'
import { healthCheck } from './lib/ai'
import { downloadJson, parseImportJson, saveResumes } from './lib/storage'
import ResumePage from './features/resume/ResumePage'
import JobsPage from './features/jobs/JobsPage'
import GreetingPage from './features/greeting/GreetingPage'
import PipelinePage from './features/pipeline/PipelinePage'
import InterviewPage from './features/interview/InterviewPage'

type Tab = 'resume' | 'jobs' | 'greeting' | 'pipeline' | 'interview'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'resume', label: '简历' },
  { key: 'jobs', label: '岗位库' },
  { key: 'greeting', label: '招呼语' },
  { key: 'pipeline', label: '投递清单' },
  { key: 'interview', label: '模拟面试' },
]

function Shell() {
  const { state, importData } = useApp()
  const [tab, setTab] = useState<Tab>('resume')
  const [health, setHealth] = useState<{ deepseek: boolean; vision: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    healthCheck().then(setHealth).catch(() => setHealth(null))
  }, [])

  const handleExport = () => downloadJson(state)

  const handleImportFile = async (file: File) => {
    const text = await file.text()
    const data = parseImportJson(text)
    if (!data) {
      alert('导入失败：文件格式不正确')
      return
    }
    if (!confirm('导入将覆盖当前数据，确定继续？')) return
    importData(data)
    saveResumes(data.resumes)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>AI 求职助手</h1>
          <div className="sub">简历诊断 · 岗位筛选 · 千岗千面招呼语 · 投递追踪 · 模拟面试</div>
        </div>
        <div className="header-actions">
          <div className="health">
            <span>
              <i className={`dot ${health?.deepseek ? 'ok' : health ? 'bad' : ''}`} />
              DeepSeek V4-Flash
            </span>
            <span>
              <i className={`dot ${health?.vision ? 'ok' : health ? 'bad' : ''}`} />
              GLM-4.6V 识图
            </span>
          </div>
          <button className="ghost small" onClick={handleExport}>
            导出备份
          </button>
          <button className="ghost small" onClick={() => fileRef.current?.click()}>
            导入
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleImportFile(f)
              e.target.value = ''
            }}
          />
        </div>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>
      <main>
        {tab === 'resume' && <ResumePage />}
        {tab === 'jobs' && <JobsPage />}
        {tab === 'greeting' && <GreetingPage />}
        {tab === 'pipeline' && <PipelinePage />}
        {tab === 'interview' && <InterviewPage />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
