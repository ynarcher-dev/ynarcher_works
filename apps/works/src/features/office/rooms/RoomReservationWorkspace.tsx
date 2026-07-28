import { PageHeader, Spinner, Tabs } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { RoomCard } from '@/features/office/rooms/RoomCard'
import { RoomReservationModal } from '@/features/office/rooms/RoomReservationModal'
import { useMeetingBranches, useMeetingRooms, type MeetingRoom } from '@/features/office/rooms/meetingRoomsApi'
import { toSpans, useDayReservations, type Reservation } from '@/features/office/rooms/reservationsApi'

const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** 오늘 기준 상대 라벨(어제/오늘/내일) 아니면 'M월 D일 (요일)'. */
function dateLabel(date: dayjs.Dayjs): string {
  const diff = date.startOf('day').diff(dayjs().startOf('day'), 'day')
  if (diff === 0) return '오늘'
  if (diff === 1) return '내일'
  if (diff === -1) return '어제'
  return `${date.format('M월 D일')} (${KO_WEEKDAYS[date.day()]})`
}

/** 상단 날짜 이동 바(‹ 라벨 ›). */
function DateNav({ date, onChange }: { date: dayjs.Dayjs; onChange: (d: dayjs.Dayjs) => void }) {
  return (
    <div className="mx-auto flex items-center gap-1 rounded-radius-full border border-gray-200 bg-white px-1.5 py-1">
      <button
        type="button"
        aria-label="이전 날"
        onClick={() => onChange(date.subtract(1, 'day'))}
        className="rounded-radius-full p-1.5 text-gray-500 hover:bg-gray-100"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-24 text-center text-body font-medium text-gray-800">
        {dateLabel(date)}
      </span>
      <button
        type="button"
        aria-label="다음 날"
        onClick={() => onChange(date.add(1, 'day'))}
        className="rounded-radius-full p-1.5 text-gray-500 hover:bg-gray-100"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}

/**
 * OFFICE 회의실 예약 화면: 지사 탭 + 날짜 이동 + 가로형 회의실 카드 목록.
 * 회의실·지사 설정은 ADMIN이 소유하고, 여기서는 예약(생성·취소)만 한다.
 */
export function RoomReservationWorkspace() {
  const [branchId, setBranchId] = useState<string>()
  const [date, setDate] = useState(() => dayjs())
  const [modalRoom, setModalRoom] = useState<MeetingRoom | null>(null)

  const branchesQuery = useMeetingBranches()
  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data])

  // 첫 로드 시 첫 지사를 선택.
  useEffect(() => {
    const first = branches[0]
    if (!branchId && first) setBranchId(first.id)
  }, [branchId, branches])

  const roomsQuery = useMeetingRooms(branchId)
  const rooms = useMemo(() => roomsQuery.data ?? [], [roomsQuery.data])
  const roomIds = useMemo(() => rooms.map((r) => r.id), [rooms])

  const dateKey = date.format('YYYY-MM-DD')
  const reservationsQuery = useDayReservations(roomIds, dateKey)

  // 회의실별 예약 묶음.
  const byRoom = useMemo(() => {
    const map = new Map<string, Reservation[]>()
    for (const r of reservationsQuery.data ?? []) {
      const arr = map.get(r.roomId) ?? []
      arr.push(r)
      map.set(r.roomId, arr)
    }
    return map
  }, [reservationsQuery.data])

  const dateObj = date.toDate()

  return (
    <div className="space-y-5">
      <PageHeader title="회의실 예약" description="원하시는 회의실을 선택하여 예약해주세요." />

      {/* 2:1 배치 — 좌측 2/3에 예약 영역, 우측 1/3은 비운다(후속 우측 패널 여지). */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {branchesQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : branches.length === 0 ? (
            <p className="rounded-radius-md border border-dashed border-gray-300 py-10 text-center text-body text-gray-500">
              등록된 지사·회의실이 없습니다. 관리자에게 문의하세요.
            </p>
          ) : (
            <>
              <Tabs
                items={branches.map((b) => ({ key: b.id, label: b.name }))}
                value={branchId ?? branches[0]?.id ?? ''}
                onChange={setBranchId}
              />

              <DateNav date={date} onChange={setDate} />

              {roomsQuery.isLoading ? (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              ) : rooms.length === 0 ? (
                <p className="rounded-radius-md border border-dashed border-gray-300 py-10 text-center text-body text-gray-500">
                  이 지사에 등록된 회의실이 없습니다.
                </p>
              ) : (
                <div className="space-y-3">
                  {rooms.map((room) => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      date={dateObj}
                      spans={toSpans(byRoom.get(room.id) ?? [])}
                      onReserve={() => setModalRoom(room)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <RoomReservationModal
        open={modalRoom !== null}
        room={modalRoom}
        dateKey={dateKey}
        reservations={modalRoom ? byRoom.get(modalRoom.id) ?? [] : []}
        onClose={() => setModalRoom(null)}
      />
    </div>
  )
}
