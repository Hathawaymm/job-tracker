/** 把 list 中 from 位置的元素移动到 to 位置（不可变，返回新数组；越界/同位置返回原数组） */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return [...list]
  const clampedTo = Math.max(0, Math.min(list.length - 1, to))
  if (from === clampedTo) return [...list]
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(clampedTo, 0, moved)
  return next
}
