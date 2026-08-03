import { PageHeader, Spinner, Tabs } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { DateNav } from '@/components/DateNav'
import { ReservationSearchBox } from '@/features/office/rooms/ReservationSearchBox'
import { RoomCard } from '@/features/office/rooms/RoomCard'
import { RoomReservationModal } from '@/features/office/rooms/RoomReservationModal'
import { useMeetingPlaces } from '@/features/office/rooms/meetingPlacesApi'
import { useMeetingRooms, type MeetingRoom } from '@/features/office/rooms/meetingRoomsApi'
import { toSpans, useDayReservations, type Reservation } from '@/features/office/rooms/reservationsApi'

/**
 * OFFICE 회의실 예약 화면: 지점 탭 + 날짜 이동 + 가로형 회의실 카드 목록.
 * 탭은 회의실 전용 지점 원장(meeting_places)이며 지사 정보와 연동하지 않는다 —
 * 설정은 ADMIN '회의실 관리'가 소유하고, 여기서는 예약(생성·취소)만 한다.
 */
export function RoomReservationWorkspace() {
  const [placeId, setPlaceId] = useState<string>()
  const [date, setDate] = useState(() => dayjs())
  const [modalRoom, setModalRoom] = useState<MeetingRoom | null>(null)

  const placesQuery = useMeetingPlaces()
  const places = useMemo(() => placesQuery.data ?? [], [placesQuery.data])

  // 첫 로드 시 첫 지점을 선택.
  useEffect(() => {
    const first = places[0]
    if (!placeId && first) setPlaceId(first.id)
  }, [placeId, places])

  const roomsQuery = useMeetingRooms(placeId)
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

      {placesQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : places.length === 0 ? (
        <p className="rounded-radius-md border border-dashed border-gray-300 py-10 text-center text-body text-gray-500">
          등록된 지점·회의실이 없습니다. 관리자에게 문의하세요.
        </p>
      ) : (
        <>
          <Tabs
            items={places.map((p) => ({ key: p.id, label: p.name }))}
            value={placeId ?? places[0]?.id ?? ''}
            onChange={setPlaceId}
          />

          {/* 날짜 바는 화면 중앙 고정 — 검색은 그 위에 겹치지 않게 왼쪽 끝에 띄운다. */}
          <div className="relative flex items-center justify-center gap-3">
            <DateNav date={date} onChange={setDate} />
            <div className="absolute left-0">
              <ReservationSearchBox
                places={places}
                onPick={(hit) => {
                  setPlaceId(hit.placeId)
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
              이 지점에 등록된 회의실이 없습니다.
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
