export interface SearchQuery {
  keyword: string
  city: string
  salary: string
  count: number
  delayRange: [number, number]
}

export interface RawJob {
  externalId?: string
  title: string
  company: string
  salary: string
  city: string
  jd: string
  url: string
}

/** 平台适配器接口：可插拔，一期 BOSS，后续可加 LinkedIn / Indeed 等 */
export interface JobSourceAdapter {
  id: string
  name: string
  search(query: SearchQuery): Promise<RawJob[]>
  /** 抓取岗位完整 JD（仅对匹配的少数岗位按需调用） */
  fetchJd?(job: RawJob): Promise<string>
}
