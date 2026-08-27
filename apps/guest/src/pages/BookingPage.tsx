import { Card, PageHeader } from '@ynarcher/ui'
import { GuestButton } from '@/components/GuestButton'
import { useAvailableSlots, useBookSlot } from '@/features/hooks'
import { formatDateTime } from '@/lib/format'

/** 멘토링 예약 — 가용 슬롯 조회 + 간편 예약(3_9_workspace_guest.md §1.1). */
export function BookingPage() {
  const { data: slots } = useAvailableSlots()
  const book = useBookSlot()
  const items = slots ?? []

  return (
    <div className="space-y-5">
      <PageHeader title="멘토링 예약" />
      <Card title="예약 가능한 시간대" count={items.length}>
        <div className="space-y-2">
          {items.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-radius-md border border-gray-300 px-3 py-2"
            >
              <span className="text-body text-gray-800">{formatDateTime(s.starts_at)}</span>
              <GuestButton disabled={book.isPending} onClick={() => book.mutate(s.id)}>
                예약 신청
              </GuestButton>
            </div>
          ))}
          {items.length === 0 && (
            <p className="py-4 text-center text-caption text-gray-500">
              예약 가능한 시간대가 없습니다.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
