import { PageHeader, Spinner, Tabs } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ReservationSearchBox } from '@/features/office/rooms/ReservationSearchBox'
import { RoomCard } from '@/features/office/rooms/RoomCard'
import { RoomReservationModal } from '@/features/office/rooms/RoomReservationModal'
import { useBranches } from '@/features/office/branches/branchesApi'
import { useMeetingRooms, type MeetingRoom } from '@/features/office/rooms/meetingRoomsApi'
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

/** 상단 날짜 이동 바(‹ 라벨 › + 달력). */
function DateNav({ date, onChange }: { date: dayjs.Dayjs; onChange: (d: dayjs.Dayjs) => void }) {
  // 달력은 브라우저 기본 date 피커를 띄운다(별도 팝오버 없이 입력 규격을 앱 전체와 맞춘다).
  const pickerRef = useRef<HTMLInputElement>(null)

  // 달력 아이콘은 꺽쇠와 달리 글리프가 상자를 꽉 채워서, 같은 여백이면 더 밖으로 나와 보인다 → 오른쪽만 4px 더 준다.
  return (
    <div className="mx-auto flex w-fit items-center gap-1 rounded-radius-full border border-gray-200 bg-white py-1 pl-1.5 pr-2.5">
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

      <span className="mx-0.5 h-4 w-px bg-gray-200" />

      <div className="relative">
        <button
          type="button"
          aria-label="날짜 선택"
          onClick={() => {
            const el = pickerRef.current
            if (!el) return
            // showPicker 미지원 브라우저에서는 포커스만 주고 키보드 입력으로 대체한다.
            if (typeof el.showPicker === 'function') el.showPicker()
            else el.focus()
          }}
          className="rounded-radius-full p-1.5 text-gray-500 hover:bg-gray-100"
        >
          <CalendarDays className="size-4" />
        </button>
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden
          value={date.format('YYYY-MM-DD')}
          onChange={(e) => {
            const next = dayjs(e.target.value)
            if (next.isValid()) onChange(next)
          }}
          className="pointer-events-none absolute bottom-0 left-1/2 size-0 border-0 p-0 opacity-0"
        />
      </div>
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

  const branchesQuery = useBranches()
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
      <PageHeader title="회의실 예약" />

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

          {/* 날짜 바는 화면 중앙 고정 — 검색은 그 위에 겹치지 않게 왼쪽 끝에 띄운다. */}
          <div className="relative flex items-center justify-center gap-3">
            <DateNav date={date} onChange={setDate} />
            <div className="absolute left-0">
              <ReservationSearchBox
                branches={branches}
                onPick={(hit) => {
                  setBranchId(hit.branchId)
                  setDate(dayjs(hit.reservedDate))
                }}
              />
            </div>
          </div>

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
