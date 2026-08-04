import { useEffect, useState } from 'react'
import { useApp } from '../hooks/useAppState'
import { loadSelectedVersionId, saveSelectedVersionId } from '../lib/storage'
import type { ResumeVersion } from '../types'

export interface ResumeSelection {
  versions: ResumeVersion[]
  version: ResumeVersion | null
  select: (id: string) => void
}

/** 各模块「使用简历」版本选择（记忆上次选择） */
export function useResumeSelection(module: string): ResumeSelection {
  const { state } = useApp()
  const versions = state.resumes
  const [versionId, setVersionId] = useState<string>(() => {
    const saved = loadSelectedVersionId(module)
    if (saved && versions.some((v) => v.id === saved)) return saved
    return versions[0]?.id ?? ''
  })

  // 版本增删后校正失效的选择
  useEffect(() => {
    setVersionId((prev) => (prev && versions.some((v) => v.id === prev) ? prev : versions[0]?.id ?? ''))
  }, [versions])

  const version = versions.find((v) => v.id === versionId) ?? versions[0] ?? null
  const select = (id: string) => {
    setVersionId(id)
    saveSelectedVersionId(module, id)
  }
  return { versions, version, select }
}

/** 版本下拉（仅多个版本时显示） */
export function ResumePicker({
  selection,
  onSelect,
}: {
  selection: ResumeSelection
  onSelect?: (id: string) => void
}) {
  if (selection.versions.length <= 1) return null
  return (
    <label className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      使用简历
      <select
        value={selection.version?.id ?? ''}
        onChange={(e) => {
          const id = e.target.value
          selection.select(id)
          onSelect?.(id)
        }}
        style={{ width: 'auto' }}
      >
        {selection.versions.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
    </label>
  )
}
