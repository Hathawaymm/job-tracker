import type { ApplicationStage, Job } from '../types'

/**
 * 从岗位数据推导投递清单阶段（纯函数，可单测）。
 * new=待确认 → confirmed=已确认 → greeted=话术就绪 → submitted=已投递 → active=进行中 → closed=已结束
 */
export function jobStage(job: Job): ApplicationStage {
  if (job.status === 'offer' || job.status === 'rejected' || job.status === 'withdrawn') return 'closed'
  if (job.submittedAt) {
    return job.status === 'interview' || job.status === 'screening' || job.status === 'written' ? 'active' : 'submitted'
  }
  if (job.greeting) return 'greeted'
  if (job.confirmed) return 'confirmed'
  return 'new'
}
