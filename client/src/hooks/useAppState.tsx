import { createContext, useContext, useEffect, useReducer, useRef, type ReactNode } from 'react'
import type { AppData, InterviewRecord, Job, LogEntry, Resume, ResumeVersion } from '../types'
import { emptyData, emptyResume, loadAll, makeResumeVersion, saveNonResume } from '../lib/storage'
import { getAppState, saveAppState } from '../lib/jobsApi'
import { nowIso, uid } from '../lib/id'

interface AppApi {
  state: AppData
  /** 简历版本操作 */
  addResumeVersion: (name: string, resume?: Resume) => string
  updateResumeVersion: (id: string, resume: Resume) => void
  deleteResumeVersion: (id: string) => void
  duplicateResumeVersion: (id: string, name: string) => string
  getResumeVersion: (id: string) => ResumeVersion | undefined
  /** 岗位/投递 */
  addJob: (job: Job) => void
  updateJob: (id: string, patch: Partial<Job>) => void
  deleteJob: (id: string) => void
  addLog: (job: Pick<Job, 'id' | 'company' | 'title'>, action: string, detail?: string) => void
  addInterview: (record: InterviewRecord) => void
  updateInterview: (id: string, patch: Partial<InterviewRecord>) => void
  deleteInterview: (id: string) => void
  importData: (data: AppData) => void
  resetAll: () => void
}

type Action =
  | { type: 'resume/add'; version: ResumeVersion }
  | { type: 'resume/update'; id: string; resume: Resume }
  | { type: 'resume/delete'; id: string }
  | { type: 'job/add'; job: Job }
  | { type: 'job/update'; id: string; patch: Partial<Job> }
  | { type: 'job/delete'; id: string }
  | { type: 'interview/add'; record: InterviewRecord }
  | { type: 'interview/update'; id: string; patch: Partial<InterviewRecord> }
  | { type: 'interview/delete'; id: string }
  | { type: 'log/add'; entry: LogEntry }
  | { type: 'import'; data: AppData }
  | { type: 'reset' }

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'resume/add':
      return { ...state, resumes: [action.version, ...state.resumes] }
    case 'resume/update':
      return {
        ...state,
        resumes: state.resumes.map((v) =>
          v.id === action.id ? { ...v, resume: action.resume, updatedAt: nowIso() } : v,
        ),
      }
    case 'resume/delete':
      return { ...state, resumes: state.resumes.filter((v) => v.id !== action.id) }
    case 'job/add':
      return { ...state, jobs: [action.job, ...state.jobs] }
    case 'job/update':
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.id ? { ...j, ...action.patch, updatedAt: nowIso() } : j,
        ),
      }
    case 'job/delete':
      return { ...state, jobs: state.jobs.filter((j) => j.id !== action.id) }
    case 'interview/add':
      return { ...state, interviews: [action.record, ...state.interviews] }
    case 'interview/update':
      return {
        ...state,
        interviews: state.interviews.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r)),
      }
    case 'interview/delete':
      return { ...state, interviews: state.interviews.filter((r) => r.id !== action.id) }
    case 'log/add':
      return { ...state, logs: [action.entry, ...state.logs].slice(0, 500) }
    case 'import':
      return action.data
    case 'reset':
      return emptyData()
  }
}

const AppContext = createContext<AppApi | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadAll())
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const synced = useRef(false)

  // 初始化：尝试从 server 拉取业务数据；server 为空时把 localStorage 存量自动迁移上去
  useEffect(() => {
    void (async () => {
      try {
        const remote = await getAppState()
        const remoteEmpty =
          remote.resumes.length === 0 &&
          remote.jobs.length === 0 &&
          remote.interviews.length === 0 &&
          remote.logs.length === 0
        if (remoteEmpty) {
          // 首次迁移：把本地存量写上去
          const local = loadAll()
          await saveAppState(local)
        } else {
          dispatch({ type: 'import', data: remote })
        }
      } catch {
        // server 不可用：保持 localStorage 数据（本地兜底）
      } finally {
        synced.current = true
      }
    })()
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current)
    }
  }, [])

  // state 变化：800ms 防抖同步到 server + 写 localStorage 兜底缓存
  useEffect(() => {
    saveNonResume(state)
    if (!synced.current) return
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      void saveAppState(state).catch(() => {
        // server 不可用：静默降级，localStorage 已兜底
      })
    }, 800)
  }, [state])

  const api: AppApi = {
    state,
    addResumeVersion: (name, resume) => {
      const version = makeResumeVersion(name, resume ?? emptyResume())
      dispatch({ type: 'resume/add', version })
      return version.id
    },
    updateResumeVersion: (id, resume) => dispatch({ type: 'resume/update', id, resume }),
    deleteResumeVersion: (id) => dispatch({ type: 'resume/delete', id }),
    duplicateResumeVersion: (id, name) => {
      const src = state.resumes.find((v) => v.id === id)
      if (!src) return ''
      const copy = makeResumeVersion(name, { ...src.resume })
      dispatch({ type: 'resume/add', version: copy })
      return copy.id
    },
    getResumeVersion: (id) => state.resumes.find((v) => v.id === id),
    addJob: (job) => dispatch({ type: 'job/add', job }),
    updateJob: (id, patch) => dispatch({ type: 'job/update', id, patch }),
    deleteJob: (id) => dispatch({ type: 'job/delete', id }),
    addLog: (job, action, detail = '') =>
      dispatch({
        type: 'log/add',
        entry: {
          id: uid(),
          jobId: job.id,
          company: job.company,
          title: job.title,
          action,
          detail,
          at: nowIso(),
        },
      }),
    addInterview: (record) => dispatch({ type: 'interview/add', record }),
    updateInterview: (id, patch) => dispatch({ type: 'interview/update', id, patch }),
    deleteInterview: (id) => dispatch({ type: 'interview/delete', id }),
    importData: (data) => dispatch({ type: 'import', data }),
    resetAll: () => dispatch({ type: 'reset' }),
  }

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>
}

export function useApp(): AppApi {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp 必须在 <AppProvider> 内使用')
  return ctx
}
