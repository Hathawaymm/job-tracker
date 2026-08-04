import type { PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { ExtractedResume } from './scoring'
import { resumeFromText, visionDescribe } from './ai'
import { fileToDataUri } from './file'

export type ResumeFileType = 'image' | 'pdf' | 'docx' | 'unsupported'

/** 按文件类型（MIME 优先，后缀兜底）判断解析策略 */
export function detectResumeFileType(file: File): ResumeFileType {
  const name = file.name.toLowerCase()
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/.test(name)) return 'image'
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (file.type.includes('wordprocessingml') || name.endsWith('.docx')) return 'docx'
  return 'unsupported'
}

/** 扫描件判定：PDF 文字层总量过少即视为图片型 PDF，需走 OCR */
export function looksScanned(text: string): boolean {
  return text.replace(/\s+/g, '').length < 50
}

const OCR_PROMPT =
  '请完整、准确地逐字提取这份简历页面中的所有文字，保留原有分段与要点结构，不要遗漏任何项目、工作、教育经历和数字。'

async function extractPdfText(file: File): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const doc = await getDocument({ data: await file.arrayBuffer() }).promise

  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    pages.push(text)
  }
  const fullText = pages.join('\n\n')

  if (looksScanned(fullText)) {
    return extractScannedPdf(doc)
  }
  return fullText
}

/** 扫描件 PDF：逐页渲染为图片，交给 GLM-4.6V 识图 */
async function extractScannedPdf(doc: PDFDocumentProxy): Promise<string> {
  const texts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    await page.render({ canvas, viewport }).promise
    const dataUri = canvas.toDataURL('image/png')
    const desc = await visionDescribe(dataUri, OCR_PROMPT)
    texts.push(desc)
  }
  return texts.join('\n\n')
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = (await import('mammoth')).default
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return result.value
}

/** 统一入口：按文件类型解析简历，提取为结构化数据 */
export async function importResumeFile(file: File): Promise<ExtractedResume> {
  const type = detectResumeFileType(file)
  let sourceText: string
  switch (type) {
    case 'image': {
      const dataUri = await fileToDataUri(file)
      sourceText = await visionDescribe(dataUri, OCR_PROMPT)
      break
    }
    case 'pdf':
      sourceText = await extractPdfText(file)
      break
    case 'docx':
      sourceText = await extractDocxText(file)
      break
    default:
      throw new Error('暂不支持该格式，请使用 PDF、Word（.docx）或图片格式的简历')
  }
  return resumeFromText(sourceText)
}
