import { Card, PageHeader } from '@ynarcher/ui'
import { useMentoringSessions } from '@/features/hooks'
import { formatDateTime } from '@/lib/format'

/**
 * 멘토링 스케줄 보드 — 배정·확정된 세션을 읽기 전용으로 훑는 화면(3_9_workspace_guest.md §1.2).
 *
 * 평가지 작성은 같은 목록에 끼워 넣지 않고 별도 메뉴('상담 평가지')가 맡는다 — 한 화면이
 * 일정 확인과 제출을 겸하면 제출할 것이 없는 날에도 폼이 목록을 밀어낸다.
 */
export function SessionBoardPage() {
  const { data: sessions } = useMentoringSessions()
  const items = sessions ?? []

  return (
    <div className="space-y-5">
      <PageHeader title="멘토링 스케줄" />
      <Card title="배정된 세션" count={items.length}>
        <div className="space-y-2">
          {items.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-radius-md border border-gray-300 px-3 py-2"
            >
              <span className="text-body text-gray-800">
                {s.round_no}회차 · {formatDateTime(s.scheduled_at)}
              </span>
              <span className="shrink-0 text-caption text-gray-600">{s.status}</span>
            </div>
          ))}
          {items.length === 0 && (
            <p className="py-4 text-center text-caption text-gray-500">
              배정된 멘토링 일정이 없습니다.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
