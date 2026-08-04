# job-tracker（AI 求职助手）

本地全栈求职工具：多版本简历（预览/导出）+ 岗位自动抓取（Chrome 扩展）+ AI 匹配/话术/模拟面试。

## 结构
- `client/` React+Vite SPA：简历 / 岗位库 / 招呼语 / 投递清单 / 模拟面试
- `server/` Express 本地代理：AI 转发 + SQLite 岗位库 + 定时调度 + 扩展任务队列
- `extension/` WXT Chrome MV3 扩展（抓取执行器，**不在根 workspaces**）

## 命令
- 开发：`npm run dev`（server :3001 + client :5173）
- 校验：`npm run typecheck`、`npm test`（同时跑 client + server 两个 vitest）
- 单测：`npm test -w client` / `npm test -w server`
- 扩展（独立项目）：`cd extension && npm install` 后 `npm run release`（构建并同步到可见的 `install-this/`）

## 数据与 AI
- 前端数据（简历/岗位/投递/日志）存 localStorage（前缀 `jobtracker:`），**简历为手动保存**（编辑不自动落盘）
- 自动抓取的岗位存 server SQLite：`server/data/jobtracker.db`
- AI key 从 `~/.local/share/opencode/auth.json` 读取（deepseek / zhipuai-coding-plan），**绝不写入前端或 git**

## 抓取机制（重要）
- 流程：web 触发 → server 排任务 → Chrome 扩展轮询领取 → 后台 BOSS tab 抓取（复用登录态）→ 回传 → 硬过滤 + AI 评分（≥65% 入池）
- 抓取前提：Chrome 已 load unpacked 加载 `extension/install-this` 且 BOSS 已登录；**无 9222 调试模式**
- 合规硬约束：随机延迟 3-8s、单次上限 50、绝不自动投递

## 坑
- `extension/` 需单独 `npm install`（不在根 workspaces）
- WXT 产物默认在隐藏目录 `.output/`；用户加载的是 `install-this/`（`npm run release` 生成）
- server 为 ESM（NodeNext），内部 import 需带 `.js` 后缀
- db 旧表缺列用 `ensureColumn` 迁移（见 server/src/db.ts）
- 真实 BOSS 抓取依赖登录态，无法自动化验证；页面结构变化会导致扩展选择器失效
