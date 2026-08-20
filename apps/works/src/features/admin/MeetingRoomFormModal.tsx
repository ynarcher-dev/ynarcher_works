import { Button, Input, Modal, Select, cn } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { RoomPhotoPicker } from '@/features/office/rooms/RoomPhotoPicker'
import { normalizeTime } from '@/features/office/rooms/availability'
import type { MeetingRoom, RoomInput } from '@/features/office/rooms/meetingRoomsApi'

const SLOT_OPTIONS = [10, 15, 20, 30, 60]
const WEEKDAYS = [
  { v: 0, label: '일' },
  { v: 1, label: '월' },
  { v: 2, label: '화' },
  { v: 3, label: '수' },
  { v: 4, label: '목' },
  { v: 5, label: '금' },
  { v: 6, label: '토' },
]

interface Props {
  open: boolean
  branchId: string
  /** 있으면 수정, 없으면 생성. */
  room?: MeetingRoom
  busy: boolean
  onClose: () => void
  onSubmit: (v: RoomInput) => void
}

/** ADMIN 회의실 생성/수정 폼. 이름·위치·인원·운영시간·슬롯·예약가능 요일·사진. */
export function MeetingRoomFormModal({ open, branchId, room, busy, onClose, onSubmit }: Props) {
  const editing = Boolean(room)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [capacity, setCapacity] = useState('')
  const [openTime, setOpenTime] = useState('09:00')
  const [closeTime, setCloseTime] = useState('18:00')
  const [slotMinutes, setSlotMinutes] = useState(30)
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  const [err, setErr] = useState('')

  // 열릴 때마다 대상에 맞춰 초기화.
  useEffect(() => {
    if (!open) return
    setName(room?.name ?? '')
    setLocation(room?.location ?? '')
    setCapacity(room?.capacity != null ? String(room.capacity) : '')
    setOpenTime(room ? normalizeTime(room.openTime) : '09:00')
    setCloseTime(room ? normalizeTime(room.closeTime) : '18:00')
    setSlotMinutes(room?.slotMinutes ?? 30)
    setWeekdays(room?.weekdays ?? [1, 2, 3, 4, 5])
    setPhotoPath(room?.photoPath ?? null)
    setErr('')
  }, [open, room])

  const toggleDay = (v: number) =>
    setWeekdays((prev) => (prev.includes(v) ? prev.filter((d) => d !== v) : [...prev, v].sort()))

  const submit = () => {
    if (!name.trim()) return setErr('회의실명을 입력하세요.')
    if (openTime >= closeTime) return setErr('마감 시간은 시작 시간보다 늦어야 합니다.')
    if (weekdays.length === 0) return setErr('예약 가능 요일을 하나 이상 선택하세요.')
    const cap = capacity.trim() ? Number(capacity) : null
    if (cap != null && (!Number.isInteger(cap) || cap < 0)) return setErr('인원은 0 이상 정수로 입력하세요.')
    setErr('')
    onSubmit({
      branchId,
      name: name.trim(),
      location: location.trim() || null,
      capacity: cap,
      photoPath,
      openTime,
      closeTime,
      slotMinutes,
      weekdays,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? '회의실 수정' : '회의실 추가'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {busy ? '저장 중…' : editing ? '저장' : '생성'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-caption font-medium text-gray-600">사진</span>
          <RoomPhotoPicker value={photoPath} onChange={setPhotoPath} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-caption font-medium text-gray-600">회의실명</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 드림플러스 강남1" />
          </label>
          <label className="block">
            <span className="mb-1 block text-caption font-medium text-gray-600">위치</span>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="예: 6F" />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="mb-1 block text-caption font-medium text-gray-600">인원</span>
            <Input
              type="number"
              min={0}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="예: 6"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-caption font-medium text-gray-600">오픈 시간</span>
            <Input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-caption font-medium text-gray-600">마감 시간</span>
            <Input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-caption font-medium text-gray-600">슬롯 단위</span>
            <Select value={String(slotMinutes)} onChange={(e) => setSlotMinutes(Number(e.target.value))}>
              {SLOT_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}분
                </option>
              ))}
            </Select>
          </label>
          <div>
            <span className="mb-1 block text-caption font-medium text-gray-600">예약 가능 요일</span>
            <div className="flex gap-1">
              {WEEKDAYS.map((d) => (
                <button
                  key={d.v}
                  type="button"
                  aria-pressed={weekdays.includes(d.v)}
                  onClick={() => toggleDay(d.v)}
                  className={cn(
                    'size-8 rounded-radius-md border text-body font-medium transition-colors',
                    weekdays.includes(d.v)
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-gray-300 text-gray-500 hover:bg-gray-50',
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {err && <p className="text-caption text-danger">{err}</p>}
      </div>
    </Modal>
  )
}
