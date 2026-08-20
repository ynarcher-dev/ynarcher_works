import { EmptyState, PageHeader, Spinner, Tabs } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { DateNav } from '@/components/DateNav'
import { ReservationSearchBox } from '@/features/office/rooms/ReservationSearchBox'
import { RoomCard } from '@/features/office/rooms/RoomCard'
import { RoomReservationModal } from '@/features/office/rooms/RoomReservationModal'
import { useBranches } from '@/features/office/branches/branchesApi'
import {
  useMeetingRooms,
  useRoomBranchIds,
  type MeetingRoom,
} from '@/features/office/rooms/meetingRoomsApi'
import { toSpans, useDayReservations, type Reservation } from '@/features/office/rooms/reservationsApi'

/**
 * OFFICE 회의실 예약 화면: 지사 탭 + 날짜 이동 + 가로형 회의실 카드 목록.
 * 탭은 지사 원장(branches)이다 — 지사 정보·자산 반출대장과 같은 목록을 쓰며,
 * 회의실이 한 대도 없는 지사는 빈 탭이 되므로 탭에서 뺀다.
 * 지사 세팅은 MANAGEMENT '지사 관리', 회의실 세팅은 ADMIN '회의실 관리'가 소유하고,
 * 여기서는 예약(생성·취소)만 한다.
 */
export function RoomReservationWorkspace() {
  const [branchId, setBranchId] = useState<string>()
  const [date, setDate] = useState(() => dayjs())
  const [modalRoom, setModalRoom] = useState<MeetingRoom | null>(null)

  const branchesQuery = useBranches()
  const withRoomsQuery = useRoomBranchIds()
  const branches = useMemo(() => {
    const withRooms = withRoomsQuery.data
    if (!withRooms) return []
    return (branchesQuery.data ?? []).filter((b) => withRooms.has(b.id))
  }, [branchesQuery.data, withRoomsQuery.data])

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

      {branchesQuery.isLoading || withRoomsQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : branches.length === 0 ? (
        <EmptyState
          title="등록된 지사·회의실이 없습니다"
          description="관리자에게 문의하세요."
        />
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
            <EmptyState title="이 지사에 등록된 회의실이 없습니다" />
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
