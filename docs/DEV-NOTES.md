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
| 9 | 评分行业锚定 | `targetIndustries` 配置（多选，可增删改，默认 `银行金融/电商零售/AI`）；`buildMatchPrompt`/`aiMatchScore` system prompt 加行业锚定规则（行业不匹配降分 <40 或 reject）；仅影响评分排序，不影响搜索/过滤 | prompts 单测断言 + 人工看 reason 判断 |
| 10 | AI 降配省钱 | 纯文字任务降推理：matchJob/pickProjects `thinking off`；composeResume/optimize/diagnose `effort low`；模拟面试保持 `deepseek-v4-flash + effort high`（用户决策不换 reasoner） | typecheck + 全量测试通过 |
| 11 | 匹配度阈值暴露 | `AutoCrawlPanel` 加「匹配度阈值 %」输入（0-100，默认 65），保存即按新阈值入池/评分；server 早已支持 | UI 实测 |
| 12 | 岗位去重改 unique_key | 方案 B：`external_id`（猎聘 job id，125/125 可提取）为唯一指纹，空则 `平台:md5(归一化公司\|标题\|城市)`；`batchFindExistingKeys` 分批查 + `idx_jobs_unique_key` 唯一索引兜底；`findPoolJobs`/`countNewSince` 按 unique_key 去重 | hash 单测 5 项 + batch-check 接口实测 |
| 13 | 项目经历「从经历库选填」 | `ExperiencePickerModal`（搜索/选中/确认选择）；`ResumeForm` 项目模块加「📥 从经历库选择」+ 每条「选填」；覆盖前二次确认；填充后即普通编辑条目，不同步回经历库 | typecheck + 浏览器实测 |
| 14 | 简历页「AI 生成简历」 | `buildGenerateResumeFromBankPrompt` + `generateResumeFromBank`（全量经历库项目 + 当前简历 + JD）；`JdPickerModal` 选 JD（岗位库优先 + 粘贴兜底）；merge 时工作/教育/基础信息自动继承当前简历 | prompts 单测 2 项 |
| 15 | 针对性简历跳转 | 生成成功后显示「查看已生成的简历」链接 → `?tab=resume&resumeId=`；`App` 读 URL 初始化 tab + `ResumePage initialResumeId`；命名 `AI-岗位-公司` | 浏览器实测 |
| 16 | 已确认待投递 + 待确认池 | `APPLICATION_STAGE_LABELS.confirmed` 改「已确认待投递」；`PoolList` 标题「待投递池」→「待确认池」（阈值动态显示）；确认文案统一 | 浏览器实测 |

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

### 6. 电脑休眠导致定时抓取错过（`executed:false` 但无任何触发记录）

- **现象**：早上 8-9 点窗口内电脑休眠，`today_windows` 显示 `executed:false`，`crawl_logs` 无该窗口任何记录——任务**根本没触发**，而非"触发了但扩展离线"。UI 上"⚪离线"是页面加载时刷新到的瞬时状态（当时 Chrome 休眠未轮询），具误导性。
- **根因**：`scheduler.ts` 原为**精确分钟匹配** `timeToMin(w.time) === nowMin`，电脑休眠错过那 1 分钟即永久错过，无补跑机制。
- **修复**（双重）：
  - macOS 定时唤醒：`sudo pmset repeat wakeorpoweron MTWRFSU 07:50:00`（morning 窗口前 10 分钟唤醒，需接电源；`pmset -g sched` 验证）。中午/晚上电脑常开无需唤醒。
  - scheduler 补跑：提取纯函数 `pickPendingWindow(windows, nowMin)`，改"时间已到/已过且未执行即补跑"，唤醒后第一个 tick（每分钟）立即执行错过的窗口；`log.info` 标注「补跑错过的窗口」。
- **验证**：scheduler 单测覆盖补跑/不提前/不重复/全执行/顺序 5 个场景；UI 扩展在线状态改为每 10s 自动轮询，并提示"休眠/关闭时显示离线属正常现象"。

### 7. 每次抓取不到 count 就停 + 深页永远抓不到（翻页/去重设计）

- **现象**：count=50 实际只回传 29/10/1 条；`runSearch` 每次从第 1 页翻固定 `maxPages=7` 页，第 8 页之后永远不抓；同一岗位（url_hash）最多 5 条重复入库。
- **根因**：①`maxPages = min(12, ceil(count/10)+2)` 固定页数上限；②`findDecidedByHash` 只跳过 confirmed/ignored，pending 岗位每次重复插入；③jobs 表 url_hash 无唯一约束。
- **方案 B（因猎聘非严格时间倒序，弃用倒序中断法）**：unique_key 去重 + 无上限翻页 + 连续全旧页防死循环。
  - unique_key = `platform:external_id`（猎聘 job id，URL `job/<id>.shtml` 提取，100% 可用）；空则 `platform:md5(归一化公司|标题|城市)`（`normalizeText` 去"市/有限公司"后缀）。
  - `batchFindExistingKeys` 分批查（≤50/批，避免大 IN）；`idx_jobs_unique_key` 唯一索引兜底；`findPoolJobs`/`countNewSince` 按 unique_key 去重。
  - 扩展 `runSearch`：每页调 `POST /api/jobs/batch-check` 过滤已抓岗位；终止条件 = 抓满 count 或空页（重试仍空）；**连续 5 页全旧视为到底**（防翻页超限后猎聘返回重复内容导致死循环）。
- **验证**：batch-check 接口实测（插入后返回 `existingIndices:[0]`）；hash 单测 5 项；连续抓 2 次 `inserted` 骤减。

### 8. ⚠️ 清理 SQL 误删全部岗位（重要教训）

- **现象**：执行存量去重 SQL 时，jobs 表 125 条被删到 1 条。
- **根因**：回填 `unique_key` 的 `UPDATE` 因**已存在的 UNIQUE 索引**（partial 索引 `WHERE unique_key IS NOT NULL`）在遇到重复 external_id 时抛 `UNIQUE constraint failed`，导致回填未完成、unique_key 仍全为 NULL；随后 `DELETE WHERE id NOT IN (SELECT MAX(id) ... GROUP BY unique_key)` 把**所有 NULL 归为一组**，只保留 MAX(id) 一条，其余全删。两步中间未检查状态。
- **修复/教训**：①回填前必须先处理重复（或先删 UNIQUE 索引，回填+删重后再建）；②`GROUP BY` 在列全为 NULL 时会把所有行归一组，`NOT IN` 删除语句极危险；③对生产数据执行破坏性 SQL 前**必须先备份**（`sqlite3 db ".backup backup.db"`）；④CLI 会话与运行中 server 并发写 DB 时，WAL 状态不可预期。
- **验证**：已清空剩余脏数据（"居家打字员"非目标岗位），岗位库需重新抓取恢复；crawl_logs 历史保留。

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
