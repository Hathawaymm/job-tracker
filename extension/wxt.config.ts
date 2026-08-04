import { defineConfig } from 'wxt'

export default defineConfig({
  manifest: {
    name: 'AI 求职助手抓取',
    description: '配合 AI 求职助手在 BOSS直聘后台抓取岗位（复用你的登录态，仅与本地服务通信）',
    permissions: ['tabs', 'scripting', 'alarms', 'storage'],
    host_permissions: [
      'https://*.zhipin.com/*',
      'http://127.0.0.1:3001/*',
      'http://localhost:3001/*',
    ],
  },
})
