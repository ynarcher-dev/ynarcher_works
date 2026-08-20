import {
  Badge,
  Button,
  DataTable,
  EmptyValue,
  Spinner,
  useToast,
  type Column,
} from '@ynarcher/ui'
import { ImageIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { MeetingPlaceBar } from '@/features/admin/MeetingPlaceBar'
import { MeetingRoomFormModal } from '@/features/admin/MeetingRoomFormModal'
import { useMeetingPlaces } from '@/features/office/rooms/meetingPlacesApi'
import { normalizeTime } from '@/features/office/rooms/availability'
import {
  roomPhotoUrl,
  useCreateRoom,
  useMeetingRooms,
  useSetRoomActive,
  useUpdateRoom,
  type MeetingRoom,
  type RoomInput,
} from '@/features/office/rooms/meetingRoomsApi'

const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const weekdayText = (days: number[]) =>
  [...days].sort().map((d) => KO_WEEKDAYS[d]).join('·')

/**
 * ADMIN 회의실 관리: 지점 관리(추가·이름 수정·비활성화) + 지점별 회의실 목록·설정.
 * 지점 목록은 지사 원장과 연동하지 않는 회의실 전용 목록이다(meeting_places).
 */
export function MeetingRoomAdminPanel() {
  const toast = useToast()
  const placesQuery = useMeetingPlaces(true)
  const places = useMemo(() => placesQuery.data ?? [], [placesQuery.data])
  const [placeId, setPlaceId] = useState<string>()

  useEffect(() => {
    const first = places[0]
    if (!placeId && first) setPlaceId(first.id)
  }, [placeId, places])

  const roomsQuery = useMeetingRooms(placeId, true)
  const rooms = roomsQuery.data ?? []

  const createRoom = useCreateRoom()
  const updateRoom = useUpdateRoom()
  const setRoomActive = useSetRoomActive()

  const [form, setForm] = useState<'create' | MeetingRoom | null>(null)
  const editing = form && form !== 'create' ? form : undefined
  const busy = createRoom.isPending || updateRoom.isPending

  const submit = async (v: RoomInput) => {
    try {
      if (editing) {
        await updateRoom.mutateAsync({ ...v, id: editing.id })
        toast.show('회의실을 수정했습니다.', 'success')
      } else {
        await createRoom.mutateAsync(v)
        toast.show('회의실을 추가했습니다.', 'success')
      }
      setForm(null)
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const toggleRoom = async (r: MeetingRoom) => {
    if (r.isActive && !window.confirm(`'${r.name}' 회의실을 비활성화하시겠습니까? OFFICE에서 숨겨집니다.`)) return
    try {
      await setRoomActive.mutateAsync({ id: r.id, isActive: !r.isActive })
      toast.show(r.isActive ? '비활성화했습니다.' : '활성화했습니다.', 'success')
    } catch {
      toast.show('변경에 실패했습니다.', 'danger')
    }
  }

  const columns: Column<MeetingRoom>[] = [
    {
      // 썸네일(h-9 w-16) 하나가 놓이는 고정폭 열 — 배지 규격(badge, 가운데)을 쓴다.
      key: 'photo',
      header: '사진',
      type: 'badge',
      render: (r) => {
        const url = roomPhotoUrl(r.photoPath)
        return url ? (
          <img src={url} alt="" className="h-9 w-16 rounded-radius-sm object-cover" />
        ) : (
          <span className="flex h-9 w-16 items-center justify-center rounded-radius-sm bg-gray-100 text-gray-400">
            <ImageIcon className="size-4" aria-hidden />
          </span>
        )
      },
    },
    { key: 'name', header: '회의실명', primary: true, type: 'name', render: (r) => r.name },
    { key: 'location', header: '위치', type: 'text', render: (r) => r.location ?? <EmptyValue /> },
    {
      key: 'capacity',
      header: '인원',
      type: 'count',
      render: (r) => (r.capacity != null ? `${r.capacity}명` : <EmptyValue />),
    },
    {
      key: 'hours',
      header: '운영시간',
      type: 'text',
      render: (r) => `${normalizeTime(r.openTime)}–${normalizeTime(r.closeTime)} · ${r.slotMinutes}분`,
    },
    {
      key: 'weekdays',
      header: '요일',
      type: 'text',
      render: (r) => weekdayText(r.weekdays) || <EmptyValue />,
    },
    {
      key: 'status',
      header: '상태',
      type: 'badge',
      render: (r) =>
        r.isActive ? <Badge tone="success">활성</Badge> : <Badge tone="neutral">비활성</Badge>,
    },
    {
      key: 'action',
      header: '관리',
      align: 'center',
      render: (r) => (
        <span className="flex items-center justify-center gap-1.5">
          <Button variant="outline" onClick={() => setForm(r)}>
            수정
          </Button>
          <Button variant="outline" onClick={() => void toggleRoom(r)}>
            {r.isActive ? '비활성화' : '활성화'}
          </Button>
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      {placesQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <>
          <MeetingPlaceBar places={places} selectedId={placeId} onSelect={setPlaceId} />

          {placeId && (
            <>
              <div className="flex justify-end">
                <Button onClick={() => setForm('create')}>회의실 등록</Button>
              </div>
              {roomsQuery.isLoading ? (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              ) : (
                <DataTable
                  columns={columns}
                  rows={rooms}
                  rowKey={(r) => r.id}
                  numbered
                  standardColumns={false}
                  emptyText="등록된 회의실이 없습니다."
                />
              )}
            </>
          )}
        </>
      )}

      {placeId && (
        <MeetingRoomFormModal
          open={form !== null}
          placeId={placeId}
          room={editing}
          busy={busy}
          onClose={() => setForm(null)}
          onSubmit={submit}
        />
      )}
    </div>
  )
}
