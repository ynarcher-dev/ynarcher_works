import { Card, PageHeader } from '@ynarcher/ui'
import { useMemo } from 'react'
import { useMyPrograms, useTimeline } from '@/features/hooks'
import { formatDateTime } from '@/lib/format'

/**
 * 보육 일정 — 참여 사업의 공개 일정 타임라인(3_9_workspace_guest.md §1.1).
 *
 * 무엇이 공개인지는 항목이 아니라 소속 메뉴의 공유 범위가 정하며 판정은 전적으로 RLS가 한다.
 */
export function SchedulePage() {
  const { data: programs } = useMyPrograms()
  const programIds = useMemo(
    () => (programs ?? []).map((p) => p.program_id),
    [programs],
  )
  const { data: timeline } = useTimeline(programIds)
  const items = timeline ?? []

  return (
    <div className="space-y-5">
      <PageHeader title="보육 일정" />
      <Card title="프로그램 타임라인" count={items.length}>
        <ol className="space-y-2">
          {items.map((t) => (
            <li key={t.id} className="flex gap-3 border-l-2 border-brand/40 pl-3">
              <div>
                <p className="text-body font-medium text-gray-900">{t.title}</p>
                <p className="text-caption text-gray-600">{formatDateTime(t.starts_at)}</p>
              </div>
            </li>
          ))}
          {items.length === 0 && (
            <p className="py-4 text-center text-caption text-gray-500">
              공개된 일정이 없습니다.
            </p>
          )}
        </ol>
      </Card>
    </div>
  )
}
