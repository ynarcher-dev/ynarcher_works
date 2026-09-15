import { Badge, Button, DensityProvider, Modal, cardText, cn, useToast } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { ReservationFormView } from '@/features/office/rooms/ReservationFormView'
import { isPastDateKey } from '@/features/office/rooms/availability'
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
 *
 * 지난 날짜는 **조회 전용**이다 — 목록은 그대로 보여주되 예약을 만들거나 취소하는 길을 닫는다.
 * 이미 일어난 일의 기록은 여기서 손댈 것이 아니라는 UI 정책이다 — 서버는 이 규칙을 갖고
 * 있지 않으므로(등록 트리거는 회의실·요일·운영시간·슬롯 정합만 본다) 지난 날짜를 막는 것은
 * 화면 쪽 책임이다. 그래도 화면 자체는 열려야 한다 — 카드 전체를 눌러 들어오는 길이
 * 생기면서 "그날 누가 썼나"를 보러 오는 것이 이 모달의 또 다른 쓰임이 됐다.
 */
export function RoomReservationModal({ open, room, dateKey, reservations, onClose }: Props) {
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const myId = user?.id
  const isAdmin = user?.role === 'super_admin'

  const create = useCreateReservation()
  const cancel = useCancelReservation()
  const [mode, setMode] = useState<'list' | 'form'>('list')
  const readOnly = isPastDateKey(dateKey, dayjs().format('YYYY-MM-DD'))
  // 폼은 조회 전용에서 열리지 않는다 — 진입 버튼을 감추는 것과 별개로 상태로도 막는다.
  const showForm = mode === 'form' && !readOnly

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
    <Modal
      open={open}
      onClose={onClose}
      title={showForm ? `예약하기: ${room.name}` : `예약 현황: ${room.name} (${dateKey})`}
      size="md"
    >
      {showForm ? (
        <ReservationFormView
          room={room}
          initialDate={dateKey}
          spans={toSpans(reservations)}
          busy={create.isPending}
          onCancel={() => setMode('list')}
          onSubmit={submit}
        />
      ) : (
        <DensityProvider value="card">
          <div className="space-y-3">
            {reservations.length === 0 ? (
              <p className={cn('rounded-radius-md border border-dashed border-gray-300 py-8 text-center', cardText.label)}>
                이 날의 예약이 없습니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {reservations.map((r) => {
                  const canCancel = !readOnly && (isAdmin || r.createdBy === myId)
                  return (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-3 rounded-radius-md border border-gray-200 bg-gray-50 p-3"
                    >
                      <div className="min-w-0">
                        <p className={cardText.subhead}>
                          {r.startTime} - {r.endTime}
                        </p>
                        <p className={cn('mt-0.5 truncate', cardText.label)}>
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

            {readOnly ? (
              <p className={cn('text-center', cardText.label)}>
                지난 날짜는 조회만 할 수 있습니다.
              </p>
            ) : (
              <Button className="w-full" onClick={() => setMode('form')}>
                + 예약하기
              </Button>
            )}
          </div>
        </DensityProvider>
      )}
    </Modal>
  )
}
