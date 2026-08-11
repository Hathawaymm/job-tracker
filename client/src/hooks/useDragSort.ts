import { useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, DragEventHandler } from 'react'
import { moveItem } from '../lib/reorder'

type SortableId = string | number

interface DropIndicator {
  id: SortableId
  pos: 'before' | 'after'
}

/** 原生 HTML5 拖拽排序：把手可拖，卡片接收 drop，按鼠标上下半区决定插入位置 */
export function useDragSort<T extends { id: SortableId }>(opts: {
  items: readonly T[]
  onReorder: (next: T[]) => void
  disabled?: boolean
}) {
  const { items, onReorder, disabled = false } = opts
  const [dragId, setDragId] = useState<SortableId | null>(null)
  const [hover, setHover] = useState<DropIndicator | null>(null)
  const dragIdRef = useRef<SortableId | null>(null)
  const hoverRef = useRef<DropIndicator | null>(null)

  const reset = () => {
    setDragId(null)
    dragIdRef.current = null
    setHover(null)
    hoverRef.current = null
  }

  const cardProps = (item: T) => {
    const onDragOver: DragEventHandler = (e) => {
      const dragging = dragIdRef.current
      if (disabled || dragging === null || dragging === item.id) return
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
      if (hoverRef.current?.id !== item.id || hoverRef.current?.pos !== pos) {
        hoverRef.current = { id: item.id, pos }
        setHover({ id: item.id, pos })
      }
    }
    const onDragLeave: DragEventHandler = () => {
      if (hoverRef.current?.id === item.id) {
        hoverRef.current = null
        setHover(null)
      }
    }
    const onDrop: DragEventHandler = (e) => {
      e.preventDefault()
      const dragging = dragIdRef.current
      const dropAt = hoverRef.current
      if (dragging === null || !dropAt) {
        reset()
        return
      }
      const fromIdx = items.findIndex((x) => x.id === dragging)
      const toIdx = items.findIndex((x) => x.id === dropAt.id)
      if (fromIdx < 0 || toIdx < 0 || (fromIdx === toIdx && dropAt.pos === 'before')) {
        reset()
        return
      }
      const to = dropAt.pos === 'after' ? toIdx + 1 : toIdx
      const next = moveItem(items, fromIdx, to)
      if (next !== items) onReorder(next)
      reset()
    }
    return { onDragOver, onDragLeave, onDrop }
  }

  const gripProps = (item: T) => ({
    draggable: !disabled,
    onDragStart: (e: ReactDragEvent) => {
      e.dataTransfer.effectAllowed = 'move'
      dragIdRef.current = item.id
      setDragId(item.id)
    },
    onDragEnd: reset,
  })

  const isDragging = (id: SortableId) => dragId === id
  const dropIndicator = (id: SortableId) => (hover?.id === id ? hover.pos : null)

  return { cardProps, gripProps, isDragging, dropIndicator, dragId }
}
