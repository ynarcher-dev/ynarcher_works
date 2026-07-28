import { Button, Input, cn, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import {
  useCreateBranch,
  useSetBranchActive,
  useUpdateBranch,
  type MeetingBranch,
} from '@/features/office/rooms/meetingRoomsApi'

interface Props {
  branches: MeetingBranch[]
  selectedId?: string
  onSelect: (id: string) => void
}

/**
 * ADMIN 지사 관리 바: 지사 칩(선택) + 추가·이름수정·활성토글.
 * 지사는 회의실 예약 전용 원장이며 MANAGEMENT 지사와 연동하지 않는다.
 */
export function MeetingBranchBar({ branches, selectedId, onSelect }: Props) {
  const toast = useToast()
  const createBranch = useCreateBranch()
  const updateBranch = useUpdateBranch()
  const setActive = useSetBranchActive()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const selected = branches.find((b) => b.id === selectedId)

  const add = async () => {
    const name = newName.trim()
    if (!name) return
    try {
      await createBranch.mutateAsync(name)
      toast.show('지사를 추가했습니다.', 'success')
      setNewName('')
      setAdding(false)
    } catch {
      toast.show('추가에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const rename = async () => {
    if (!selected) return
    const name = window.prompt('지사명 변경', selected.name)?.trim()
    if (!name || name === selected.name) return
    try {
      await updateBranch.mutateAsync({ id: selected.id, name })
      toast.show('지사명을 변경했습니다.', 'success')
    } catch {
      toast.show('변경에 실패했습니다.', 'danger')
    }
  }

  const toggleActive = async () => {
    if (!selected) return
    try {
      await setActive.mutateAsync({ id: selected.id, isActive: !selected.isActive })
      toast.show(selected.isActive ? '비활성화했습니다.' : '활성화했습니다.', 'success')
    } catch {
      toast.show('변경에 실패했습니다.', 'danger')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {branches.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect(b.id)}
            className={cn(
              'rounded-radius-full border px-3 py-1.5 text-body font-medium transition-colors',
              b.id === selectedId
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50',
              !b.isActive && 'opacity-60',
            )}
          >
            {b.name}
            {!b.isActive && <span className="ml-1 text-caption text-gray-400">(비활성)</span>}
          </button>
        ))}

        {adding ? (
          <span className="flex items-center gap-1">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="지사명"
              className="w-32"
            />
            <Button onClick={add} disabled={!newName.trim()}>
              추가
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              취소
            </Button>
          </span>
        ) : (
          <Button variant="outline" onClick={() => setAdding(true)}>
            + 지사 추가
          </Button>
        )}
      </div>

      {selected && (
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={rename}>
            이름 수정
          </Button>
          <Button variant="outline" onClick={toggleActive}>
            {selected.isActive ? '비활성화' : '활성화'}
          </Button>
        </div>
      )}
    </div>
  )
}
