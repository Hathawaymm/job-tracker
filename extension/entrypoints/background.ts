// AI 求职助手抓取扩展 - 后台 Service Worker
// 职责：确保「抓取工作台」常驻页面打开。抓取逻辑全部在 workbench 页面执行
// （MV3 SW 有 30s 空闲回收限制，长时间抓取必须由常驻页面承担）

export default defineBackground(() => {
  const WORKBENCH = browser.runtime.getURL('/workbench.html')

  async function ensureWorkbench(): Promise<void> {
    try {
      const tabs = await browser.tabs.query({ url: WORKBENCH })
      if (tabs.length > 0) return
      await browser.tabs.create({ url: WORKBENCH, active: false })
      console.log('[workbench] 已打开抓取工作台（后台标签页）')
    } catch (err) {
      console.log('[workbench] 打开失败:', err instanceof Error ? err.message : err)
    }
  }

  browser.runtime.onInstalled.addListener(() => {
    void ensureWorkbench()
  })
  browser.runtime.onStartup.addListener(() => {
    void ensureWorkbench()
  })

  // 定期检查：工作台被关闭后自动重开（SW 被回收也能靠 alarm 唤醒检查）
  void browser.alarms.create('wb-check', { periodInMinutes: 1 })
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'wb-check') void ensureWorkbench()
  })

  void ensureWorkbench()
})
