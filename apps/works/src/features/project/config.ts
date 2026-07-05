import type { BadgeTone } from '@ynarcher/ui'

export type ProjectType = 'GLOBAL' | 'NEW_BIZ' | 'GENERAL'
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW'
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE'

export const TYPE_LABELS: Record<ProjectType, string> = {
  GLOBAL: '글로벌',
  NEW_BIZ: '신사업',
  GENERAL: '일반',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
}

export const priorityTone: Record<Priority, BadgeTone> = {
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'neutral',
}

export const TASK_COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'TODO', label: '할 일' },
  { key: 'IN_PROGRESS', label: '진행 중' },
  { key: 'REVIEW', label: '검토 대기' },
  { key: 'DONE', label: '완료' },
]

export const NEXT_TASK_STATUS: Partial<Record<TaskStatus, TaskStatus>> = {
  TODO: 'IN_PROGRESS',
  IN_PROGRESS: 'REVIEW',
  REVIEW: 'DONE',
}
