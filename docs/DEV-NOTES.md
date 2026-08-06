# job-tracker 开发笔记（DEV-NOTES）

> 本文件为**按需查阅**的详录，不随会话自动加载。需要时用 `read docs/DEV-NOTES.md` 定位目标段落（顶部锚点目录可直接跳转）。

📑 目录
- [一、已完成功能](#一已完成功能)
- [二、踩坑详录](#二踩坑详录)
- [三、卡住的问题](#三卡住的问题)
- [四、架构备忘](#四架构备忘)

---

## 一、已完成功能

按实施顺序记录，标注关键实现位置与验证方式。

| # | 功能 | 实现要点 | 验证 |
|---|------|----------|------|
| 1 | 默认平台换猎聘 | server 默认 `platform='liepin'`；扩展 `wxt.config.ts` host_permissions 加 liepin；workbench `buildSearchUrl`/`scrapeList`/`scrapeJd` 平台分发（`LIE_CITY_CODES` 30 城码表） | 猎聘无需登录可抓取（实机验证）；DB 存量 config 已迁移 |
| 2 | 薪资单位切换 | `salaryUnit: 'month'\|'year'` 贯穿 server（CONFIG_KEYS/GET/PUT/clamp）+ 扩展 `lieSalaryCode` 换算 + client 切换 UI | curl + UI 实测 |
| 3 | 手动链接抓取 | `POST /api/jobs/manual`（校验 http(s) 前缀）+ client 岗位库「🔗 粘贴链接抓取」；走扩展 `fetchJd` 通道，`fetchJobByUrl` 启发式提取 title/company | curl 端到端通过 |
| 4 | 个人经历库 | SQLite `experience_bank` 表 + `/api/experiences` CRUD；client「经历库」tab；`pickProjectsForJob`/`composeResumeForJob`（prompts/scoring/ai）为岗位生成针对性简历 | curl + 浏览器实测 |
| 5 | 经历库导入 | 从简历导入项目 + 从文件导入（JSON/Word/PDF/Markdown/图片，复用 `importResumeFile`，按公司\|名称去重） | 真实 docx 提取 4808 字符 |
| 6 | 文件导入导出 | `detectResumeFileType` 加 markdown；Word 导出（docx 库，`ResumePreview.tsx`，零 token）；PDF/Word/Markdown 上传各只耗 1 次 AI 提取 | node 实测生成 docx 且 mammoth 可读回 |
| 7 | 字段级就地编辑 | `EditableField.tsx`（浏览态纸样/编辑态蓝光 `#3b82f6`）；`ResumeForm.tsx` 全字段 + `ExperienceBankPage.tsx` 卡片就地编辑（乐观更新+失败回滚）；tab 顺序经历库第一/简历第二 | typecheck + 55+27 测试 + 浏览器实测 |
| 8 | 日志基建 | `server/src/logger.ts` 零依赖双写（console + `server/data/logs/jobtracker-YYYY-MM-DD.log` 按天滚动）；替换 crawler/scheduler/index/ext 全部 console；加任务领取/回传 shape/畸形条目/全局异常埋点 | 日志落盘实测 |

---

## 二、踩坑详录

格式：**现象 → 根因 → 修复 → 验证**。每一条都是实际花过时间排查的问题。

### 1. `NOT NULL constraint failed: jobs.title`（抓取从未成功）

- **现象**：每次抓取报错，`crawl_logs` 连续多条 `status='error'` + 该错误，jobs 表 0 行。
- **根因**：扩展 `openTabAndScrape` 里 `results.map(r => r.result)`，`chrome.scripting.executeScript` 对主 frame 返回 `[{ result: [job1,...] }]`，map 后多包一层成 `[[job1,...]]`；`runSearch` 把内层数组当单条 push，server `crawler.ts` 遍历到数组 → `raw.title = undefined` → better-sqlite3 绑定 NULL → 违反 `title NOT NULL`。
- **修复**：`main.ts` 改为 `results.flatMap(r => Array.isArray(r.result) ? r.result : [r.result])`；server 端循环加形状校验（跳过 `Array.isArray(raw)` 条目）+ title 兜底 `'未命名岗位'` + `log.error` 留痕。
- **验证**：typecheck + 测试全绿；扩展产物确认含 flatMap；真实抓取需 Chrome 加载扩展后验证。

### 2. Word 导入报「AI 未返回内容」

- **现象**：上传真实 docx（17KB，含 drawing 元素，mammoth 提取 4808 字符）后 AI 提取返回空。
- **根因**：`resumeFromText` 用了 `thinking:'on'` + `maxTokens:3000`，thinking 推理挤占输出预算，content 为空。
- **修复**：改 `thinking:'off'` + `maxTokens:8000`。
- **验证**：修复后导入正常（需真实重测确认）。

### 3. EditableField 测试方法坑（React 受控组件）

- **现象**：用 `evaluate_script` 直接 `el.value = x` + `dispatchEvent('input')` 后 blur，数据未保存。
- **根因**：React 受控组件需原生 setter 才能触发 onChange；直接赋值绕过 React 状态。
- **修复/正确姿势**：用真实键盘输入（`type_text`）或 `chrome-devtools_fill`，或 eval 中走 `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(...)`。
- **验证**：改用真实 type 输入 + Tab 失焦后，server 数据确认更新。

### 4. 日志路径 bug

- **现象**：logger 文件写到了 `job-tracker/data/logs/` 而非预期 `server/data/logs/`。
- **根因**：`new URL('.', import.meta.url)` 指向 `server/src/`，再 `..` 两次落到项目根。
- **修复**：`DATA_DIR = fileURLToPath(new URL('../data/logs/', import.meta.url))`，并删除误写目录。
- **验证**：重载后日志落盘到 `server/data/logs/`。

### 5. chrome-devtools uid 失效

- **现象**：页面重渲染（如 Tab 失焦触发保存）后，旧的 snapshot uid 点击报「did not become interactive」。
- **修复/正确姿势**：每次交互前重新 `take_snapshot` 拿新 uid；纯数据核对用 `evaluate_script` 读 DOM。
- **验证**：重新 snapshot 后操作正常。

---

## 三、卡住的问题

- **真实抓取无法自动化验证**：需要 Chrome `chrome://extensions` load unpacked 加载 `extension/install-this/` 且打开 workbench 常驻页。改扩展后**必须 `npm run release` 重建 + Chrome 手动重载**，否则抓的是旧产物。此步骤始终需用户配合。
- **BOSS 直聘依赖登录态**：无法自动化测试；猎聘是默认平台（免登录）。
- **页面改版风险**：workbench 选择器（`.job-detail-box`、`.ellipsis-1[title]` 等）依赖猎聘/BOSS DOM 结构，改版即失效，无自动回归手段。

---

## 四、架构备忘

### 抓取数据流（扩展 ↔ server 契约，重点）

```
web 触发 POST /api/jobs/run
  → crawler.ts runCrawl → enqueueSearch 排任务（内存 Map，server 重启即清）
    → 扩展轮询 GET /api/ext/task 领取 → 后台 tab openTabAndScrape
      → POST /api/ext/result 回传 { taskId, result }
        → server completeTask 透传 → crawler 入库/过滤/评分 → 写 crawl_logs + jobs
```

**关键契约（血的教训）**：`chrome.scripting.executeScript` 返回 `Array<InjectionResult>`（每个 `result` 是被注入函数的返回值）。列表抓取函数返回**数组**时必须 flatMap 展平；字符串返回（JD）保持单元素。**server 端必须对回传数据做形状防御**，不能信任扩展返回结构。

### 数据分层

| 层 | 位置 | 说明 |
|----|------|------|
| 前端数据 | localStorage `jobtracker:*` | 简历（手动保存）/岗位/投递/日志 |
| 经历库 | SQLite `experience_bank` | 跨浏览器持久化 |
| 抓取岗位/任务/日志 | SQLite `jobs`/`tasks`/`crawl_logs` | server 独占 |
| AI key | `~/.local/share/opencode/auth.json` | 不入库、不入 git |

### 平台适配要点（猎聘）

- 城市码 `dq`：北京 010 / 上海 020 / 广州 050020 等（`LIE_CITY_CODES`，30 城）
- 薪资档 `salaryCode`：1-7（月薪时需 `lieSalaryCode` 换算，配合 `salaryUnit`）
- 选择器：`.job-detail-box`（卡片）、`a[href*="liepin.com/job/"]`（标题链接）、`.ellipsis-1[title]`（标题文本）、`[data-nick="job-detail-company-info"]`（公司）、`a[href*="liepin.com/job/"]` 匹配 `([\w\d]+)` 取 externalId
