import { useEffect, useRef, useState } from 'react'
import { interviewSystemPrompt, streamChat } from '../../lib/ai'
import { load, save } from '../../lib/storage'
import { nowIso } from '../../lib/id'
import { ResumePicker, useResumeSelection } from '../../components/ResumePicker'

interface Message {
  role: 'user' | 'ai'
  content: string
  at: string
}

const MSG_KEY = 'interview-messages'

export default function InterviewPage() {
  const sel = useResumeSelection('interview')
  const resume = sel.version?.resume ?? null
  const [messages, setMessages] = useState<Message[]>(() => load<Message[]>(MSG_KEY, []))
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    save(MSG_KEY, messages)
  }, [messages])

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const requireResume = (): boolean => {
    if (!resume) {
      setError('没有可用的简历版本，请先在「简历」页创建')
      return false
    }
    if (resume.name || resume.projects.length > 0 || resume.summary) return true
    setError('该简历版本内容为空，请先到「简历」页填写再开始模拟面试')
    return false
  }

  const pushAi = async (userContent: string, system: string, extraUser: string) => {
    setStreaming(true)
    setError('')
    setMessages((prev) => [...prev, { role: 'user', content: userContent, at: nowIso() }, { role: 'ai', content: '', at: nowIso() }])
    const history = messages.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
    try {
      const text = await streamChat(
        [
          { role: 'system', content: system },
          ...history,
          { role: 'user', content: extraUser },
        ],
        { thinking: 'on', effort: 'high' },
        (chunk) => {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            next[next.length - 1] = { ...last, content: last.content + chunk }
            return next
          })
        },
      )
      setMessages((prev) => {
        const next = [...prev]
        next[next.length - 1] = { ...next[next.length - 1], content: text }
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 回复失败')
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setStreaming(false)
    }
  }

  const handleStart = async () => {
    if (!requireResume() || !resume) return
    if (messages.length > 0) {
      if (!confirm('已有进行中的面试，重新开始会清空对话，确定？')) return
    }
    setMessages([])
    await pushAi('（系统：开始面试）', interviewSystemPrompt(resume), '请开始面试。先做个开场白，然后提出第一个问题。')
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || streaming) return
    if (!requireResume() || !resume) return
    setInput('')
    if (messages.length === 0) {
      setError('请先点击「开始面试」')
      return
    }
    await pushAi(text, interviewSystemPrompt(resume), text)
  }

  const handleReview = async () => {
    if (messages.length < 2 || streaming) return
    setReviewing(true)
    setError('')
    const transcript = messages.map((m) => `${m.role === 'user' ? '候选人' : '面试官'}：${m.content}`).join('\n')
    try {
      const system =
        '你是一位资深面试复盘教练。请根据下面的面试对话记录，用简体中文输出一份复盘：1) 候选人表现亮点；2) 暴露的薄弱环节；3) 具体改进建议（含下次如何回答示例）。分三部分，简洁有力。'
      const text = await streamChat(
        [{ role: 'system', content: system }, { role: 'user', content: transcript }],
        { thinking: 'on', effort: 'high' },
        (chunk) => {
          setMessages((prev) => [...prev, { role: 'ai', content: chunk, at: nowIso() }])
        },
      )
      setMessages((prev) => [...prev, { role: 'ai', content: text, at: nowIso() }])
    } catch (err) {
      setError(err instanceof Error ? err.message : '复盘失败')
    } finally {
      setReviewing(false)
    }
  }

  return (
    <div>
      <div className="panel">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <ResumePicker
            selection={sel}
            onSelect={() => {
              setMessages([])
              save(MSG_KEY, [])
              setError('')
            }}
          />
          <span className="muted small">切换版本会清空当前面试会话</span>
          <button className="primary" disabled={streaming} onClick={() => void handleStart()}>
            🎬 开始面试
          </button>
          <button className="ghost" disabled={streaming || reviewing} onClick={() => void handleReview()}>
            {reviewing ? (
              <>
                <span className="spinner" /> 复盘中…
              </>
            ) : (
              '📋 结束并 AI 复盘'
            )}
          </button>
          <button className="ghost" disabled={streaming} onClick={() => setMessages([])}>
            清空对话
          </button>
          <span className="muted small">面试官会结合你的简历提问并追问，点「开始面试」后直接作答即可</span>
        </div>
        {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {messages.length === 0 && (
        <div className="empty">
          准备好后点击「开始面试」。面试官将基于你的简历提出真实问题，边聊边追问，结束后可一键复盘。
        </div>
      )}

      {messages.length > 0 && (
        <>
          <div className="chat-box" ref={boxRef}>
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}>
                <div className="who">{m.role === 'user' ? '你' : '面试官'}</div>
                <div className="bubble">
                  {m.content || (streaming && i === messages.length - 1 ? <span className="spinner" /> : '')}
                </div>
                {m.content && <div className="when">{new Date(m.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>}
              </div>
            ))}
            {streaming && (
              <div className="msg ai">
                <div className="bubble">
                  <span className="spinner" />
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <textarea
              rows={2}
              value={input}
              placeholder="输入你的回答…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleSend()
                }
              }}
            />
            <button className="primary" style={{ alignSelf: 'stretch' }} disabled={streaming || !input.trim()} onClick={() => void handleSend()}>
              发送
            </button>
          </div>
        </>
      )}
    </div>
  )
}
