import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import type { Resume } from '../types'

export type DocFormat = 'md' | 'docx' | 'pdf'

export function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** 生成 Markdown 简历文本 */
export function resumeToMarkdown(resume: Resume): string {
  const lines: string[] = []

  lines.push(`# ${resume.name || '未命名'}`)
  lines.push('')
  if (resume.title) lines.push(`**求职意向**：${resume.title}`)
  const contact = [resume.city, resume.phone, resume.email].filter(Boolean).join('  ·  ')
  if (contact) lines.push(`**联系方式**：${contact}`)
  if (resume.summary) {
    lines.push('')
    lines.push('## 个人简介')
    lines.push('')
    lines.push(resume.summary)
  }
  if (resume.skills.length > 0) {
    lines.push('')
    lines.push('## 技能')
    lines.push('')
    lines.push(resume.skills.join(' · '))
  }
  if (resume.experiences.length > 0) {
    lines.push('')
    lines.push('## 工作经历')
    lines.push('')
    for (const e of resume.experiences) {
      lines.push(`### ${e.company}｜${e.role}（${e.period}）`)
      if (e.highlights.some(Boolean)) {
        for (const h of e.highlights.filter(Boolean)) lines.push(`- ${h}`)
      }
      lines.push('')
    }
  }
  if (resume.projects.length > 0) {
    lines.push('## 项目经历')
    lines.push('')
    for (const p of resume.projects) {
      lines.push(`### ${[p.company, p.name].filter(Boolean).join(' · ')}${p.role ? `｜${p.role}` : ''}`)
      if (p.description) lines.push('')
      if (p.description) lines.push(p.description)
      if (p.points.some(Boolean)) {
        for (const pt of p.points.filter(Boolean)) lines.push(`- ${pt}`)
      }
      lines.push('')
    }
  }
  if (resume.education.length > 0) {
    lines.push('## 教育经历')
    lines.push('')
    for (const e of resume.education) {
      lines.push(`### ${e.school}｜${e.major}｜${e.degree}（${e.period}）`)
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** 生成 Word 简历文档（docx）并触发下载 */
export async function exportDocx(resume: Resume, filename: string): Promise<void> {
  const children: Paragraph[] = []

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: resume.name || '未命名', bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: resume.title || '求职意向：待填写' })],
    }),
  )
  const contact = [resume.city, resume.phone, resume.email].filter(Boolean).join('  ·  ')
  if (contact) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: contact })],
      }),
    )
  }

  const section = (title: string, body: Paragraph[]) => {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240 }, children: [new TextRun({ text: title, bold: true })] }),
      ...body,
    )
  }
  const bullet = (text: string) =>
    new Paragraph({
      bullet: { level: 0 },
      children: [new TextRun({ text })],
    })
  const itemHead = (left: string, right: string) =>
    new Paragraph({
      spacing: { before: 120 },
      children: [
        new TextRun({ text: left, bold: true }),
        right ? new TextRun({ text: `\t${right}` }) : new TextRun(''),
      ],
    })

  if (resume.summary) {
    section('个人简介', [new Paragraph({ children: [new TextRun({ text: resume.summary })] })])
  }
  if (resume.skills.length > 0) {
    section('技能', [new Paragraph({ children: [new TextRun({ text: resume.skills.join(' · ') })] })])
  }
  if (resume.experiences.length > 0) {
    const body: Paragraph[] = []
    for (const e of resume.experiences) {
      body.push(itemHead(`${e.company}｜${e.role}`, e.period))
      for (const h of e.highlights.filter(Boolean)) body.push(bullet(h))
    }
    section('工作经历', body)
  }
  if (resume.projects.length > 0) {
    const body: Paragraph[] = []
    for (const p of resume.projects) {
      body.push(itemHead([p.company, p.name].filter(Boolean).join(' · ') + (p.role ? `｜${p.role}` : ''), ''))
      if (p.description) body.push(new Paragraph({ children: [new TextRun({ text: p.description })] }))
      for (const pt of p.points.filter(Boolean)) body.push(bullet(pt))
    }
    section('项目经历', body)
  }
  if (resume.education.length > 0) {
    const body: Paragraph[] = []
    for (const e of resume.education) {
      body.push(itemHead(`${e.school}｜${e.major}｜${e.degree}`, e.period))
    }
    section('教育经历', body)
  }

  const doc = new Document({ sections: [{ properties: {}, children }] })
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** 导出 PDF（浏览器打印，用户另存为 PDF） */
export function exportPdf(): void {
  window.print()
}

/** 按格式导出简历文档 */
export async function exportResumeDoc(resume: Resume, format: DocFormat, filenameBase: string): Promise<void> {
  const date = new Date().toISOString().slice(0, 10)
  if (format === 'md') {
    downloadFile(resumeToMarkdown(resume), `${filenameBase}-${date}.md`, 'text/markdown;charset=utf-8')
  } else if (format === 'docx') {
    await exportDocx(resume, `${filenameBase}-${date}.docx`)
  } else {
    exportPdf()
  }
}
