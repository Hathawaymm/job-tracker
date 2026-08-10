import { describe, it, expect, afterAll } from 'vitest'
import { db, getAppState, setAppState } from '../db.js'

const TEST_KEY = '__test_app_state__'

afterAll(() => {
  db.prepare('DELETE FROM app_state WHERE key = ?').run(TEST_KEY)
})

describe('app_state 键值对', () => {
  it('未存在时返回 null', () => {
    expect(getAppState(TEST_KEY)).toBeNull()
  })

  it('set 后可读取，且覆盖更新', () => {
    setAppState(TEST_KEY, JSON.stringify({ a: 1 }))
    expect(JSON.parse(getAppState(TEST_KEY) ?? '{}')).toEqual({ a: 1 })
    setAppState(TEST_KEY, JSON.stringify({ b: 2 }))
    expect(JSON.parse(getAppState(TEST_KEY) ?? '{}')).toEqual({ b: 2 })
  })
})
