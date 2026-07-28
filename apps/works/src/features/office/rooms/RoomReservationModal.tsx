import { Badge, Button, Modal, useToast } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { ReservationFormView } from '@/features/office/rooms/ReservationFormView'
import type { MeetingRoom } from '@/features/office/rooms/meetingRoomsApi'
import {
  isOverlapError,
  toSpans,
  useCancelReservation,
  useCreateReservation,
  type Reservation,
} from '@/features/office/rooms/reservationsApi'

interface Props {
  open: boolean
  room: MeetingRoom | null
  /** 선택 날짜(YYYY-MM-DD). */
  dateKey: string
  /** 이 회의실·날짜의 유효 예약 목록. */
  reservations: Reservation[]
  onClose: () => void
}

/**
 * 회의실 예약 모달(레퍼런스 이미지3→2 흐름): 기본은 그날 예약 목록 + 취소,
 * '+ 예약하기'로 폼 뷰 전환. 취소는 본인·관리자만 노출한다.
 */
export function RoomReservationModal({ open, room, dateKey, reservations, onClose }: Props) {
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const myId = user?.id
  const isAdmin = user?.role === 'super_admin'

  const create = useCreateReservation()
  const cancel = useCancelReservation()
  const [mode, setMode] = useState<'list' | 'form'>('list')

  // 열릴 때마다 목록 뷰로 초기화.
  useEffect(() => {
    if (open) setMode('list')
  }, [open, room?.id])

  if (!room) return null

  const submit = (v: { date: string; startTime: string; endTime: string }) => {
    create.mutate(
      { roomId: room.id, ...v },
      {
        onSuccess: () => {
          toast.show('예약했습니다.', 'success')
          setMode('list')
        },
        onError: (e) =>
          toast.show(
            isOverlapError(e) ? '이미 예약된 시간대입니다.' : '예약에 실패했습니다.',
            'danger',
          ),
      },
    )
  }

  const doCancel = (r: Reservation) => {
    if (!myId) return
    if (!window.confirm(`${r.startTime} - ${r.endTime} 예약을 취소할까요?`)) return
    cancel.mutate(
      { id: r.id, cancelledBy: myId },
      {
        onSuccess: () => toast.show('예약을 취소했습니다.', 'success'),
        onError: () => toast.show('취소에 실패했습니다.', 'danger'),
      },
    )
  }

  return (
    <Modal open={open} onClose={onClose} title={`예약: ${room.name}`} size="md">
      {mode === 'form' ? (
        <ReservationFormView
          room={room}
          initialDate={dateKey}
          spans={toSpans(reservations)}
          busy={create.isPending}
          onCancel={() => setMode('list')}
          onSubmit={submit}
        />
      ) : (
        <div className="space-y-3">
          {reservations.length === 0 ? (
            <p className="rounded-radius-md border border-dashed border-gray-300 py-8 text-center text-body text-gray-500">
              이 날의 예약이 없습니다.
            </p>
          ) : (
            <ul className="space-y-2">
              {reservations.map((r) => {
                const canCancel = isAdmin || r.createdBy === myId
                return (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-radius-md border border-gray-200 bg-gray-50 p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-body font-semibold text-brand">
                        {r.startTime} - {r.endTime}
                      </p>
                      <p className="mt-0.5 truncate text-caption text-gray-600">
                        {r.createdByName ?? '예약자'}
                      </p>
                    </div>
                    {canCancel ? (
                      <Button
                        variant="outline-danger"
                        onClick={() => doCancel(r)}
                        disabled={cancel.isPending}
                      >
                        취소
                      </Button>
                    ) : (
                      <Badge tone="neutral">예약됨</Badge>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <Button className="w-full" onClick={() => setMode('form')}>
            + 예약하기
          </Button>
        </div>
      )}
    </Modal>
  )
}
