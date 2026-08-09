# job-tracker（AI 求职助手）

本地全栈求职工具：多版本简历（预览/导出/Word）+ 岗位自动抓取（Chrome 扩展）+ AI 匹配/话术/模拟面试。

📑 文档索引
- 结构 / 命令 / 数据与 AI / 抓取机制 / 扩展与产物 / 日志 / 已知问题
- **开发笔记（已完成功能 · 踩坑详录 · 卡住问题 · 架构备忘）→ [`docs/DEV-NOTES.md`](docs/DEV-NOTES.md) 按需查阅**

## 结构
- `client/` React+Vite SPA：经历库 / 简历 / 岗位库 / 招呼语 / 投递清单 / 模拟面试
  - 关键组件：`EditableField`（点击字段即编辑）、`ExperiencePickerModal`（项目选填）、`JdPickerModal`（AI 生成选 JD）、`ResumePicker`（跨页版本选择）
- `server/` Express 本地代理：AI 转发 + SQLite（jobs/tasks/crawl_logs/experience_bank）+ 定时调度 + 扩展任务队列
- `extension/` WXT Chrome MV3 扩展（抓取执行器，**不在根 workspaces**）

## 命令
- 开发：`npm run dev`（server :3001 + client :5173）
- 校验：`npm run typecheck`、`npm test`（同时跑 client + server 两个 vitest）
- 单测：`npm test -w client` / `npm test -w server`
- 扩展（独立项目）：`cd extension && npm install` 后 `npm run release`（构建并同步到可见的 `install-this/`）

## 数据与 AI
- 前端数据（简历/岗位/投递/日志）存 localStorage（前缀 `jobtracker:`），**简历为手动保存**（编辑不自动落盘）
- 经历库持久化在 server SQLite `experience_bank` 表（跨浏览器不丢）
- 自动抓取的岗位存 server SQLite：`server/data/jobtracker.db`；**岗位去重用 `unique_key`**（`platform:external_id`，空则 `platform:md5(归一化公司|标题|城市)`），有 `idx_jobs_unique_key` 唯一索引兜底
- AI key 从 `~/.local/share/opencode/auth.json` 读取（deepseek / zhipuai-coding-plan），**绝不写入前端或 git**

## 抓取机制（重要）
- 流程：web 触发 → server 排任务 → Chrome 扩展轮询领取 → 后台 tab 抓取（复用登录态）→ 回传 → **unique_key 差集去重** → 硬过滤 + AI 评分（≥ 阈值入池，阈值可在 UI 配置）
- **默认平台为猎聘（liepin）**，BOSS 直聘仅作 fallback；抓取前提：Chrome 已 load unpacked 加载 `extension/install-this`
- **翻页策略（方案 B）**：猎聘非严格时间倒序，扩展每页调 `POST /api/jobs/batch-check` 过滤已抓岗位；无页数硬上限，翻页直到抓满 count 或遇空页；连续 5 页全旧视为到底（防死循环）
- 手动抓取：`POST /api/jobs/manual` 按 URL 抓单条岗位（走扩展 fetchJd 通道，绕过列表反爬）
- **目标行业 `targetIndustries`**（config 字段，多选）：仅用于 AI 评分排序锚定——行业不匹配的岗位自动降分；不影响搜索/过滤
- 合规硬约束：随机延迟 3-8s、单次上限 50、绝不自动投递

## 扩展与产物
- 扩展需单独 `npm install`（不在根 workspaces）
- WXT 产物默认在隐藏目录 `.output/`；用户加载的是 `install-this/`（`npm run release` 生成）
- `extension/wxt.config.ts` host_permissions：`*.liepin.com/*`、`*.zhipin.com/*`、本地 3001
- 猎聘 URL 参数：`dq` 城市码（北京010/上海020/广州050020 等 30 城，`LIE_CITY_CODES`）、`salaryCode` 年薪档(1-7)、薪资单位 month/year（`lieSalaryCode` 换算）
- 修改扩展源码后**必须 `npm run release` 重建**，否则 Chrome 加载的仍是旧产物

## 日志
- `server/src/logger.ts` 零依赖双写：console + 按天滚动文件 `server/data/logs/jobtracker-YYYY-MM-DD.log`
- 埋点：抓取开始/任务领取/回传 shape/畸形条目/失败/全局 API 异常
- 抓取生命周期另落 SQLite `crawl_logs` 表（唯一持久历史）

## 已知问题
- 真实抓取依赖 Chrome 加载扩展，无法自动化验证；页面结构改版会导致扩展选择器失效（需更新 workbench 选择器）
- **定时任务休眠方案**：电脑休眠时本机 server+Chrome 均暂停，无法"休眠中执行"。已用双重机制解决：
  - macOS 定时唤醒：`sudo pmset repeat wakeorpoweron MTWRFSU 07:50:00`（morning 窗口前 10 分钟唤醒，需接电源）
  - scheduler 补跑：窗口时间已过未执行则唤醒后第一个 tick 立即补跑（`pickPendingWindow`，不再精确分钟匹配）
- server 为 ESM（NodeNext），内部 import 需带 `.js` 后缀
- db 旧表缺列用 `ensureColumn` 迁移（见 server/src/db.ts）
