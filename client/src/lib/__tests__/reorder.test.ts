import { describe, expect, it } from 'vitest'
import { moveItem } from '../reorder'

describe('moveItem', () => {
  const list = ['a', 'b', 'c', 'd']

  it('向后移动', () => {
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('向前移动', () => {
    expect(moveItem(list, 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('移动到末尾', () => {
    expect(moveItem(list, 0, list.length - 1)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('移动到开头', () => {
    expect(moveItem(list, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('同位置返回原顺序', () => {
    expect(moveItem(list, 1, 1)).toEqual(list)
  })

  it('越界时钳制到边界', () => {
    expect(moveItem(list, 0, 99)).toEqual(['b', 'c', 'd', 'a'])
    expect(moveItem(list, 3, -5)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('源下标越界返回原数组', () => {
    expect(moveItem(list, 99, 0)).toEqual(list)
  })

  it('空数组', () => {
    expect(moveItem([] as string[], 0, 1)).toEqual([])
  })

  it('不可变：不修改原数组', () => {
    const src = [...list]
    moveItem(src, 0, 2)
    expect(src).toEqual(list)
  })
})
