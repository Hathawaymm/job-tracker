import { describe, it, expect, vi } from 'vitest'

// 使用 vi.resetModules 隔离模块状态，便于独立测试
async function freshModule() {
  vi.resetModules()
  return await import('../ext.js')
}

describe('ext 任务队列', () => {
  it('心跳/在线状态', async () => {
    const ext = await freshModule()
    expect(ext.isExtensionOnline()).toBe(false)
    ext.touchHeartbeat()
    expect(ext.isExtensionOnline()).toBe(true)
  })

  it('排队 → 领取 → 完成（回传结果）', async () => {
    const ext = await freshModule()
    const query = { keyword: '前端', city: '上海', salary: '20k-30k', count: 50, delayRange: [3, 8] as [number, number] }
    const promise = ext.enqueueSearch(query)
    const task = ext.peekTask()
    expect(task).not.toBeNull()
    expect(task?.type).toBe('search')
    expect(task?.query?.keyword).toBe('前端')

    const fakeJobs = [{ title: '前端', company: 'A', salary: '20K', city: '上海', url: 'https://x.com/job/1', externalId: '1', jd: '' }]
    ext.completeTask(task!.taskId, fakeJobs)
    await expect(promise).resolves.toEqual(fakeJobs)
    expect(ext.peekTask()).toBeNull()
  })

  it('失败（回传错误）', async () => {
    const ext = await freshModule()
    const promise = ext.enqueueSearch({ keyword: 'a', city: '', salary: '', count: 5, delayRange: [3, 8] as [number, number] })
    const task = ext.peekTask()
    ext.failTask(task!.taskId, '抓取失败')
    await expect(promise).rejects.toThrow('抓取失败')
  })

  it('超时自动失败', async () => {
    const ext = await freshModule()
    const promise = ext.enqueueSearch({ keyword: 'a', city: '', salary: '', count: 5, delayRange: [3, 8] as [number, number] }, 50)
    await expect(promise).rejects.toThrow('超时')
  })

  it('补 JD 任务类型', async () => {
    const ext = await freshModule()
    const promise = ext.enqueueFetchJd('https://x.com/job/1')
    const task = ext.peekTask()
    expect(task?.type).toBe('fetchJd')
    expect(task?.url).toBe('https://x.com/job/1')
    ext.completeTask(task!.taskId, '完整 JD 文本')
    await expect(promise).resolves.toBe('完整 JD 文本')
  })
})
