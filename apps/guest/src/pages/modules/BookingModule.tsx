import { Card, useToast } from '@ynarcher/ui'
import { GuestButton } from '@/components/GuestButton'
import { useBookSlot, useModuleSlots } from '@/features/hooks'
import { formatDateTime } from '@/lib/format'

/**
 * 1:1 매칭 메뉴 — 이 메뉴가 연 시간대를 조회하고 간편 예약한다(3_9_workspace_guest.md §1.1).
 * 슬롯당 활성 예약 1건 유니크 인덱스가 동시 예약을 막으므로, 실패는 화면이 아니라 서버가 낸다.
 */
export function BookingModule({ moduleId }: { moduleId: string }) {
  const { data } = useModuleSlots(moduleId)
  const book = useBookSlot(moduleId)
  const toast = useToast()
  const slots = data ?? []

  const onBook = async (slotId: string) => {
    try {
      await book.mutateAsync(slotId)
      toast.show('예약을 신청했습니다.', 'success')
    } catch {
      toast.show('예약하지 못했습니다. 이미 마감된 시간대일 수 있습니다.', 'danger')
    }
  }

  return (
    <Card title="예약 가능한 시간대" count={slots.length}>
      <div className="space-y-2">
        {slots.map((slot) => (
          <div
            key={slot.id}
            className="flex items-center justify-between gap-3 rounded-radius-md border border-gray-300 px-3 py-2"
          >
            <span className="text-body text-gray-800">{formatDateTime(slot.starts_at)}</span>
            <GuestButton disabled={book.isPending} onClick={() => void onBook(slot.id)}>
              예약 신청
            </GuestButton>
          </div>
        ))}
        {slots.length === 0 && (
          <p className="py-4 text-center text-caption text-gray-500">
            예약 가능한 시간대가 없습니다.
          </p>
        )}
      </div>
    </Card>
  )
}
