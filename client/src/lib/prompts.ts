import type { Resume } from '../types'

// ---------------------------------------------------------------------------
// 提示词构造（纯函数，可单测）
// ---------------------------------------------------------------------------

/** 把结构化简历转成文本，用于填充提示词 */
export function resumeToText(r: Resume): string {
  const lines: string[] = []
  if (r.name || r.title) lines.push(`姓名：${r.name}；求职意向：${r.title}`)
  if (r.city || r.phone || r.email) lines.push(`城市：${r.city}；电话：${r.phone}；邮箱：${r.email}`)
  if (r.summary) lines.push(`个人简介：${r.summary}`)
  if (r.skills.length > 0) lines.push(`技能：${r.skills.join('、')}`)

  if (r.experiences.length > 0) {
    lines.push('工作经历：')
    for (const e of r.experiences) {
      lines.push(`- ${e.company}｜${e.role}（${e.period}）`)
      for (const h of e.highlights) lines.push(`  · ${h}`)
    }
  }

  if (r.projects.length > 0) {
    lines.push('项目经历：')
    for (const p of r.projects) {
      lines.push(`- ${p.company ? `${p.company}｜` : ''}${p.name}｜${p.role}`)
      if (p.description) lines.push(`  简介：${p.description}`)
      for (const pt of p.points) lines.push(`  · ${pt}`)
    }
  }

  if (r.education.length > 0) {
    lines.push('教育经历：')
    for (const e of r.education) lines.push(`- ${e.school}｜${e.major}｜${e.degree}（${e.period}）`)
  }

  return lines.join('\n')
}

const JSON_RULE =
  '只输出一个合法 JSON 对象，不要包含 markdown 代码块标记或任何解释文字。'

// ---- 简历诊断 ----
export function buildDiagnosePrompt(resume: Resume): { system: string; user: string } {
  const system =
    '你是一位拥有 10 年经验的资深 HR 和简历顾问。你会像面试官一样审视简历，给出客观、具体、可执行的评价。回答必须用简体中文。'
  const user = `请诊断以下简历，指出亮点、不足与改进建议。
要求：输出 JSON，格式为 {"highlights": string[], "weaknesses": string[], "suggestions": string[]}。每条 1 句话，亮点 2-4 条、不足 2-4 条、建议 3-5 条，重点放在项目经历的量化表达和与岗位的匹配度上。

${JSON_RULE}

简历内容：
"""${resumeToText(resume)}"""`
  return { system, user }
}

// ---- STAR 润色 ----
export function buildStarPrompt(resume: Resume, target: { name: string; description: string; points: string[] }): {
  system: string
  user: string
} {
  const system =
    '你是一位资深简历润色专家，精通 STAR 法则（Situation 情境、Task 任务、Action 行动、Result 结果）。回答必须用简体中文。'
  const user = `请把下面项目经历改写成 STAR 法则下的专业表达：每条要点需体现【行动】与【可量化的结果】，避免流水账；如果原文缺少结果数据，可以补充合理、符合常识的量化估计，但不得编造与原文明显冲突的事实。
要求：输出 JSON，格式为 {"points": string[]}，与原要点数量相同（若有 3 条就输出 3 条）。每条控制在 30-60 字。

${JSON_RULE}

候选人技能背景：${resume.skills.length > 0 ? resume.skills.join('、') : '（未填写）'}
项目名称：${target.name}
项目简介：${target.description}
原要点：
${target.points.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
  return { system, user }
}

// ---- 岗位匹配筛选 ----
export function buildMatchPrompt(
  resume: Resume,
  jobText: string,
  targetIndustries: string[] = [],
): { system: string; user: string } {
  const system =
    '你是一位严谨的求职匹配顾问。请结合候选人简历与岗位 JD，评估匹配度，剔除明显超出能力范围或不匹配的岗位。回答必须用简体中文。'
  const industryRule =
    targetIndustries.length > 0
      ? `\n行业锚定规则（首要判断维度）：先判断岗位所属行业是否在候选人目标行业（${targetIndustries.join('、')}）内。
- 行业明显不相关时，score 应显著降低（一般低于 40，或直接标记 reject）；行业相关后再重点评估技能/经验匹配度。
- reason 中应明确指出岗位行业与目标行业的关系（匹配/不匹配）。`
      : ''
  const user = `请评估候选人与该岗位的匹配程度，并给出建议。
要求：输出 JSON，格式为 {"score": number, "fitLevel": "high"|"medium"|"low"|"reject", "reason": string, "suggestion": string}。
- score 为 0-100 整数；
- fitLevel 取值：high=高度匹配建议投递，medium=基本匹配可尝试，low=匹配度低不建议优先，reject=明确不匹配（如硬性要求差距过大、明显超出资历范围）请拒绝投递；
- reason 一句话说明筛选理由（2-3 个要点，逗号分隔）；
- suggestion 一句可执行的建议。
${industryRule}

${JSON_RULE}

候选人简历：
"""${resumeToText(resume)}"""

岗位 JD：
"""${jobText}"""`
  return { system, user }
}

// ---- 千岗千面招呼语 ----
export function buildGreetingPrompt(
  resume: Resume,
  job: { company: string; title: string; city: string; salary: string; jd: string },
): { system: string; user: string } {
  const system =
    '你是一位求职沟通专家，擅长为不同岗位量身定制打招呼语。要求真诚、自然、有针对性，绝不使用群发式模板。回答必须用简体中文。'
  const user = `请为候选人针对该岗位写一段打招呼语。
要求：
- 60 字以内，一段话，语气自然诚恳，像真人主动沟通；
- 必须结合该岗位 JD 的关键要求和候选人简历中 1-2 个最相关的亮点，体现出「我了解你们要什么，而我恰好匹配」；
- 不堆砌技能名词，不空洞吹捧，不用「你好」之外的客套开场；
- 直接输出招呼语正文，不要任何前缀、标题或引号。

候选人简历（摘要）：
"""${resumeToText(resume)}"""

目标岗位：${job.company}｜${job.title}
城市：${job.city}；薪资：${job.salary}
JD：
"""${job.jd}"""`
  return { system, user }
}

// ---- 简历信息提取（图片/文本 → 结构化 Resume）----
export function buildResumeExtractPrompt(sourceText: string): { system: string; user: string } {
  const system =
    '你是专业的简历信息提取器。从候选人简历内容中提取结构化信息，忠实于原文，不编造、不遗漏。回答必须用简体中文。'
  const user = `请把下面的简历内容提取为结构化 JSON。
要求：输出 JSON，格式为 {"name": string, "title": string, "city": string, "phone": string, "email": string, "summary": string, "skills": string[], "experiences": [{"company": string, "role": string, "period": string, "highlights": string[]}], "projects": [{"name": string, "role": string, "period": string, "description": string, "points": string[]}], "education": [{"school": string, "major": string, "degree": string, "period": string}]}。
- 没有的字段填空字符串或空数组；
- summary 用 1-2 句话概括候选人定位；
- experiences 的 highlights 拆成要点，保留量化信息；projects 的 points 同理；
- 技能 skills 拆成单个技能条目。

${JSON_RULE}

简历内容：
"""${sourceText}"""`
  return { system, user }
}

// ---- AI 简历优化（基于诊断结果整份优化）----
export function buildOptimizePrompt(
  resume: Resume,
  diagnose: { highlights: string[]; weaknesses: string[]; suggestions: string[] },
): { system: string; user: string } {
  const system =
    '你是资深简历优化师。基于 HR 诊断结果对整份简历进行优化重写，严格保留所有事实信息（公司名、时间、学历、量化数据），不编造新经历。优化方向：强化 STAR 结构、量化成果、突出与求职意向的匹配度、精简冗余表达。回答必须用简体中文。'
  const user = `请基于以下诊断建议，优化整份简历并输出结构化 JSON。
要求：输出 JSON，格式为 {"name": string, "title": string, "city": string, "phone": string, "email": string, "summary": string, "skills": string[], "experiences": [{"company": string, "role": string, "period": string, "highlights": string[]}], "projects": [{"company": string, "name": string, "role": string, "description": string, "points": string[]}], "education": [{"school": string, "major": string, "degree": string, "period": string}]}。
- 保持原有结构和字段不变，仅优化文字表达；
- highlights 和 points 用 STAR 法则改写，补充行动与量化结果；
- summary 精炼为 1-2 句有力概括；
- 不增删经历条目，不改变公司/学校/时间等事实。

${JSON_RULE}

HR 诊断结果：
亮点：${diagnose.highlights.join('；') || '无'}
不足：${diagnose.weaknesses.join('；') || '无'}
建议：${diagnose.suggestions.join('；') || '无'}

原简历：
"""${resumeToText(resume)}"""`
  return { system, user }
}

// ---- 模拟面试 ----
export function buildInterviewSystemPrompt(resume: Resume): string {
  return `你是一位严格的面试官，正在对候选人进行真实求职面试。候选人简历如下：
"""${resumeToText(resume)}"""

面试规则：
1. 结合候选人的简历内容与求职意向，提出真实面试中可能出现的问题，从自我介绍、项目深挖、技术/业务问题到行为面（STAR 追问）依次推进；
2. 每次只问 1 个问题；
3. 候选人回答后，先给一句简短点评（指出亮点或可改进处），再追问下一个问题或切换方向；
4. 全程用简体中文，语气专业、有追问感，不替候选人作答。`
}

// ---- 个人经历库：按岗位挑选项目 ----

export interface ExperienceBankItem {
  id: number
  company: string
  name: string
  role: string
  period: string
  description: string
  points: string[]
  tags: string[]
}

/** 把经历库条目序列化为文本，供提示词使用 */
export function experiencesToText(items: ExperienceBankItem[]): string {
  return items
    .map((p, i) => {
      const lines = [`${i + 1}. [id=${p.id}] ${p.company ? `${p.company}｜` : ''}${p.name}｜${p.role}（${p.period}）`]
      if (p.tags.length > 0) lines.push(`   标签：${p.tags.join('、')}`)
      if (p.description) lines.push(`   简介：${p.description}`)
      for (const pt of p.points) lines.push(`   · ${pt}`)
      return lines.join('\n')
    })
    .join('\n')
}

/** 从经历库挑选最匹配岗位的项目（返回选中 id 与理由） */
export function buildPickProjectsPrompt(
  jobJd: string,
  items: ExperienceBankItem[],
  resume: Resume,
): { system: string; user: string } {
  const system =
    '你是一位资深求职顾问，擅长把候选人过往项目经历与目标岗位 JD 做匹配，挑选最能证明胜任力的 2-4 个项目用于生成针对性简历。回答必须用简体中文。'
  const user = `请从下面的个人经历库中，挑选最匹配该岗位 JD 的 2-4 个项目。
要求：输出 JSON，格式为 {"selected": [{"id": number, "reason": string}], "summary": string}。
- selected 里每个项目必须来自经历库中的 id，reason 一句话说明为何选中（对应 JD 哪条要求）；
- summary 用 1-2 句话概括如何把这些项目组织进简历。

${JSON_RULE}

岗位 JD：
"""${jobJd}"""

候选人基础信息（技能/求职意向）：
"""${resumeToText(resume)}"""

个人经历库：
"""${experiencesToText(items)}"""`
  return { system, user }
}

/** 用选中项目 + 基础信息组装一份针对性简历（结构化 Resume） */
export function buildComposeResumePrompt(
  jobJd: string,
  picked: Array<{ id: number; reason: string }>,
  items: ExperienceBankItem[],
  resume: Resume,
): { system: string; user: string } {
  const system =
    '你是一位资深简历撰写专家。针对目标岗位 JD，用候选人的基础信息 + 指定的项目经历，组装一份针对性简历。忠于事实，不编造数据，表达按 STAR 法则优化。回答必须用简体中文。'
  const byId = new Map(items.map((p) => [p.id, p]))
  const pickedText = picked
    .map((p) => {
      const src = byId.get(p.id)
      if (!src) return ''
      const lines = [`- ${src.company ? `${src.company}｜` : ''}${src.name}｜${src.role}（${src.period}）`]
      if (src.description) lines.push(`  简介：${src.description}`)
      for (const pt of src.points) lines.push(`  · ${pt}`)
      return lines.join('\n')
    })
    .filter(Boolean)
    .join('\n')
  const user = `请组装一份针对该岗位的简历。
要求：输出 JSON，格式为 {"name": string, "title": string, "city": string, "phone": string, "email": string, "summary": string, "skills": string[], "experiences": [{"company": string, "role": string, "period": string, "highlights": string[]}], "projects": [{"company": string, "name": string, "role": string, "description": string, "points": string[]}], "education": [{"school": string, "major": string, "degree": string, "period": string}]}。
- 基础信息（姓名/电话/邮箱/教育）沿用候选人原值；
- 项目经历只使用下面指定的项目，按 JD 重要性排序，points 可用 STAR 法则润色但不得改变事实；
- experiences 保留候选人全部工作经历；
- summary 结合岗位 JD 与选中项目撰写。

${JSON_RULE}

岗位 JD：
"""${jobJd}"""

候选人基础信息：
"""${resumeToText(resume)}"""

 指定用于本简历的项目经历：
"""${pickedText}"""`
  return { system, user }
}

/** 简历页「AI 生成简历」：全量经历库 + 当前简历 + JD，AI 从库中筛选相关度高/中项目并组装完整简历 */
export function buildGenerateResumeFromBankPrompt(
  jobJd: string,
  items: ExperienceBankItem[],
  resume: Resume,
): { system: string; user: string } {
  const system =
    '你是一位资深简历撰写专家。针对目标岗位 JD，从候选人的全量个人经历库中挑选最相关（相关度高/中）的项目，结合候选人已有的工作经历与教育经历，组装一份针对性简历。忠于事实，不编造数据，表达按 STAR 法则优化。回答必须用简体中文。'
  const user = `请针对该岗位生成一份定制简历。
要求：输出 JSON，格式为 {"summary": string, "skills": string[], "projects": [{"company": string, "name": string, "role": string, "description": string, "points": string[]}]}。
- summary：结合 JD 与选中项目，用 1-2 句话撰写个人简介/自我评价；
- skills：基于 JD 与经历库提炼技能列表；
- projects：从下方个人经历库中挑选 2-4 个最相关（相关度高/中）的项目，按 JD 重要性排序，points 用 STAR 法则润色但不得改变事实；相关度低或无关的项目不要使用。
- 注意：工作经历、教育经历、姓名电话邮箱等基础信息不要输出，系统会从候选人原简历自动保留。

${JSON_RULE}

岗位 JD：
"""${jobJd}"""

候选人原简历（工作/教育/基础信息由此继承，仅作背景参考）：
"""${resumeToText(resume)}"""

个人经历库（全部候选项目）：
"""${experiencesToText(items)}"""`
  return { system, user }
}
