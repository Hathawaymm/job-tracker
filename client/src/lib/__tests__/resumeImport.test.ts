import { describe, it, expect } from 'vitest'
import { detectResumeFileType, looksScanned } from '../resumeImport'

function fakeFile(name: string, type: string): File {
  return { name, type } as File
}

describe('detectResumeFileType', () => {
  it('按 MIME 识别图片', () => {
    expect(detectResumeFileType(fakeFile('a.png', 'image/png'))).toBe('image')
    expect(detectResumeFileType(fakeFile('b.jpeg', 'image/jpeg'))).toBe('image')
  })

  it('按扩展名兜底识别图片（MIME 为空时）', () => {
    expect(detectResumeFileType(fakeFile('c.png', ''))).toBe('image')
  })

  it('识别 PDF', () => {
    expect(detectResumeFileType(fakeFile('resume.pdf', 'application/pdf'))).toBe('pdf')
    expect(detectResumeFileType(fakeFile('resume.pdf', ''))).toBe('pdf')
  })

  it('识别 docx', () => {
    expect(detectResumeFileType(fakeFile('resume.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toBe('docx')
    expect(detectResumeFileType(fakeFile('resume.docx', ''))).toBe('docx')
  })

  it('老版 .doc 视为不支持', () => {
    expect(detectResumeFileType(fakeFile('resume.doc', 'application/msword'))).toBe('unsupported')
    expect(detectResumeFileType(fakeFile('resume.txt', 'text/plain'))).toBe('unsupported')
  })
})

describe('looksScanned', () => {
  it('文字量充足不算扫描件', () => {
    const longText =
      '张三 前端开发工程师 求职意向：资深前端 5 年工作经验。技能：React、TypeScript、Vite、Node.js、Webpack、Git。' +
      '工作经历：某科技有限公司 前端负责人，负责核心业务系统开发，性能优化提升 40%。' +
      '项目经历：电商中台系统，负责整体架构设计与实现，支撑日活 10 万用户。'
    expect(looksScanned(longText)).toBe(false)
  })

  it('文字量过少（含空白）判定为扫描件', () => {
    expect(looksScanned('   \n\n  ')).toBe(true)
    expect(looksScanned('A')).toBe(true)
  })
})
