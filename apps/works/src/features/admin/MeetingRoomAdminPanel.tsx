import {
  Badge,
  Button,
  DataTable,
  EmptyValue,
  Spinner,
  TagChip,
  cn,
  useToast,
  type Column,
} from '@ynarcher/ui'
import { ImageIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MeetingRoomFormModal } from '@/features/admin/MeetingRoomFormModal'
import { useBranches } from '@/features/office/branches/branchesApi'
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

/** 지사 원장의 단일 세팅 지점(MANAGEMENT). 여기서는 링크로만 안내한다. */
const BRANCH_ADMIN_PATH = '/management?tab=branches'

const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const weekdayText = (days: number[]) =>
  [...days].sort().map((d) => KO_WEEKDAYS[d]).join('·')

/**
 * ADMIN 회의실 관리: 지사를 골라 그 지사의 회의실 목록·설정을 편집한다.
 * 지사 목록 자체(추가·이름·비활성화)는 여기서 만들지 않는다 — 원장은 MANAGEMENT
 * '지사 관리'가 소유하고(2026-08-20 회의실 전용 지점 원장 폐기), 여기는 고르기만 한다.
 */
export function MeetingRoomAdminPanel() {
  const toast = useToast()
  const branchesQuery = useBranches(true)
  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data])
  const [branchId, setBranchId] = useState<string>()

  useEffect(() => {
    const first = branches[0]
    if (!branchId && first) setBranchId(first.id)
  }, [branchId, branches])

  const roomsQuery = useMeetingRooms(branchId, true)
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
      {branchesQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : branches.length === 0 ? (
        <p className="text-body text-gray-500">
          등록된 지사가 없습니다. 먼저 <Link className="text-brand underline" to={BRANCH_ADMIN_PATH}>지사 관리</Link>에서 지사를 등록하세요.
        </p>
      ) : (
        <>
          {/* 지사 칩은 고르기 전용이다 — 이름·활성 여부를 바꾸는 자리는 '지사 관리' 한 곳뿐. */}
          <div className="flex flex-wrap items-center gap-2">
            {branches.map((b) => (
              <TagChip
                key={b.id}
                selected={b.id === branchId}
                onClick={() => setBranchId(b.id)}
                className={cn(!b.isActive && 'opacity-60')}
              >
                {b.name}
                {!b.isActive && <span className="text-gray-400">(비활성)</span>}
              </TagChip>
            ))}
            <Link className="text-caption text-gray-500 underline" to={BRANCH_ADMIN_PATH}>
              지사 관리
            </Link>
          </div>

          {branchId && (
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

      {branchId && (
        <MeetingRoomFormModal
          open={form !== null}
          branchId={branchId}
          room={editing}
          busy={busy}
          onClose={() => setForm(null)}
          onSubmit={submit}
        />
      )}
    </div>
  )
}
