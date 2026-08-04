declare module 'mammoth' {
  interface MammothOptions {
    arrayBuffer?: ArrayBuffer
  }
  interface MammothResult {
    value: string
  }
  interface Mammoth {
    extractRawText(options: MammothOptions): Promise<MammothResult>
  }
  const mammoth: Mammoth
  export default mammoth
}
