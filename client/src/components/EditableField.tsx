import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  placeholder?: string
  disabled?: boolean
}

/**
 * 可点击即编辑的字段：浏览态像印刷的纸（纯文本），点击后变为可填写的输入框。
 * 失焦保存（onChange）、Enter 确认、Esc 取消。
 */
export default function EditableField({ value, onChange, multiline = false, placeholder = '', disabled = false }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) {
      ref.current?.focus()
      ref.current?.select()
    }
  }, [editing])

  const start = () => {
    if (disabled) return
    setDraft(value)
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    if (draft !== value) onChange(draft)
  }

  const cancel = () => {
    setEditing(false)
    setDraft(value)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !multiline) commit()
    else if (e.key === 'Escape') cancel()
  }

  const hasValue = value.trim().length > 0

  if (editing) {
    const common = {
      ref: ref as never,
      value: draft,
      onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown,
      placeholder,
      className: 'ef-edit',
    }
    return multiline ? <textarea {...common} /> : <input {...common} />
  }

  return (
    <div className={hasValue ? 'ef-view' : 'ef-view ef-empty'} onClick={start} title={disabled ? '' : '点击编辑'}>
      {hasValue ? value : <span className="muted">{placeholder || '（空）'}</span>}
    </div>
  )
}
