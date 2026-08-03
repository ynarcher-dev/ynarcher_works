import { Button, Input, Modal, TagChip, cn, useToast } from '@ynarcher/ui'
import { Pencil, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  useCreateMeetingPlace,
  useSetMeetingPlaceActive,
  useUpdateMeetingPlace,
  type MeetingPlace,
} from '@/features/office/rooms/meetingPlacesApi'

interface Props {
  places: MeetingPlace[]
  selectedId?: string
  onSelect: (id: string) => void
}

/**
 * ADMIN 회의실 관리의 지점 바 — 선택 + 지점 자체의 추가·이름 수정·비활성화.
 * 지사 원장(MANAGEMENT '지사 관리')과는 연동하지 않는 독립 목록이다.
 * 회의실 예약 탭에 그대로 노출되므로 여기가 탭 목록의 단일 편집 지점이다.
 */
export function MeetingPlaceBar({ places, selectedId, onSelect }: Props) {
  const toast = useToast()
  const createPlace = useCreateMeetingPlace()
  const updatePlace = useUpdateMeetingPlace()
  const setActive = useSetMeetingPlaceActive()

  const [form, setForm] = useState<'create' | MeetingPlace | null>(null)
  const [name, setName] = useState('')
  const editing = form && form !== 'create' ? form : undefined
  const busy = createPlace.isPending || updatePlace.isPending

  useEffect(() => {
    if (form) setName(editing?.name ?? '')
  }, [form, editing])

  const submit = async () => {
    if (!name.trim()) return
    try {
      if (editing) {
        await updatePlace.mutateAsync({ id: editing.id, name })
        toast.show('지점명을 수정했습니다.', 'success')
      } else {
        await createPlace.mutateAsync({ name })
        toast.show('지점을 추가했습니다.', 'success')
      }
      setForm(null)
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const toggle = async (p: MeetingPlace) => {
    if (
      p.isActive &&
      !window.confirm(`'${p.name}' 지점을 비활성화하시겠습니까? 회의실 예약 탭에서 숨겨집니다.`)
    )
      return
    try {
      await setActive.mutateAsync({ id: p.id, isActive: !p.isActive })
      toast.show(p.isActive ? '비활성화했습니다.' : '활성화했습니다.', 'success')
    } catch {
      toast.show('변경에 실패했습니다.', 'danger')
    }
  }

  const selected = places.find((p) => p.id === selectedId)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {places.map((p) => (
        <TagChip
          key={p.id}
          selected={p.id === selectedId}
          onClick={() => onSelect(p.id)}
          className={cn(!p.isActive && 'opacity-60')}
        >
          {p.name}
          {!p.isActive && <span className="text-gray-400">(비활성)</span>}
        </TagChip>
      ))}

      <Button variant="outline" className="gap-1" onClick={() => setForm('create')}>
        <Plus className="size-4" aria-hidden />
        지점 등록
      </Button>

      {selected && (
        <>
          <Button variant="ghost" className="gap-1" onClick={() => setForm(selected)}>
            <Pencil className="size-4" aria-hidden />
            이름 수정
          </Button>
          <Button variant="ghost" onClick={() => void toggle(selected)}>
            {selected.isActive ? '비활성화' : '활성화'}
          </Button>
        </>
      )}

      {places.length === 0 && (
        <p className="text-body text-gray-500">
          등록된 지점이 없습니다. 먼저 지점을 추가하세요.
        </p>
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={editing ? '지점 이름 수정' : '지점 등록'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)} disabled={busy}>
              취소
            </Button>
            <Button onClick={() => void submit()} disabled={busy || !name.trim()}>
              {busy ? '저장 중…' : editing ? '저장' : '생성'}
            </Button>
          </>
        }
      >
        <label className="block">
          <span className="mb-1 block text-caption font-medium text-gray-600">지점명</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 서울(강남)"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
          />
          <span className="mt-1 block text-caption text-gray-500">
            회의실 예약 화면의 탭으로 그대로 노출됩니다. 지사 정보와는 별개 목록입니다.
          </span>
        </label>
      </Modal>
    </div>
  )
}
