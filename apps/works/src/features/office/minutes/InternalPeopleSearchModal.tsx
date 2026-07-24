import { Button, Input, Modal } from '@ynarcher/ui'
import { Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useEmployees } from '@/features/hub/hooks'
import type { PickerPerson } from '@/features/office/minutes/MinutePeoplePicker'
import type { MinutePersonRole } from '@/features/office/minutes/minutesApi'

interface Props {
  open: boolean
  onClose: () => void
  /** 이 모달이 담당하는 역할(참석자 또는 참조). */
  role: MinutePersonRole
  /** 회의록의 전체 내부 인원(참석자+참조) — 역할 간 중복 방지에 함께 쓴다. */
  people: PickerPerson[]
  onChange: (next: PickerPerson[]) => void
  title: string
}

/**
 * 내부 인원(참석자·참조) 검색 전용 모달. 임직원 원장에서 이름·이메일로 찾아 추가한다 —
 * 생성 기능은 없다(임직원은 MANAGEMENT 원장이 소유). 인라인 피커와 동일하게 한 사람은
 * 참석자·참조 중 한쪽에만 들어가도록 다른 역할에 이미 있는 사람은 후보에서 제외한다.
 */
export function InternalPeopleSearchModal({ open, onClose, role, people, onChange, title }: Props) {
  const { data: employees } = useEmployees()
  const [keyword, setKeyword] = useState('')

  const otherRoleIds = useMemo(
    () => new Set(people.filter((p) => p.role !== role).map((p) => p.userId)),
    [people, role],
  )
  const sameRoleIds = useMemo(
    () => new Set(people.filter((p) => p.role === role).map((p) => p.userId)),
    [people, role],
  )

  const candidates = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return (employees ?? [])
      .filter((e) => !otherRoleIds.has(e.id))
      .filter(
        (e) =>
          kw === '' ||
          e.name.toLowerCase().includes(kw) ||
          (e.email ?? '').toLowerCase().includes(kw),
      )
      .slice(0, 50)
  }, [employees, keyword, otherRoleIds])

  // 행을 누르면 추가, 다시 누르면 해제(토글).
  const toggle = (userId: string) => {
    if (sameRoleIds.has(userId)) {
      onChange(people.filter((p) => !(p.userId === userId && p.role === role)))
    } else {
      onChange([...people, { userId, role }])
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={title}
      footer={
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <div className="space-y-2">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="이름 또는 이메일로 임직원 검색"
          aria-label="임직원 검색"
          autoFocus
        />
        <div className="min-h-[3rem] rounded-radius-md border border-gray-200">
          {candidates.length === 0 ? (
            <p className="px-3 py-4 text-body-sm text-gray-500">일치하는 임직원이 없습니다.</p>
          ) : (
            <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
              {candidates.map((e) => {
                const added = sameRoleIds.has(e.id)
                return (
                  <li key={e.id}>
                    {/* 행을 누르면 추가, 다시 누르면 해제(토글) — 별도 버튼 없이 행 클릭으로 처리. */}
                    <button
                      type="button"
                      onClick={() => toggle(e.id)}
                      className={
                        'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-fast ' +
                        (added ? 'bg-brand/10 hover:bg-brand/15' : 'hover:bg-gray-50')
                      }
                    >
                      <span
                        className={
                          'grid size-5 shrink-0 place-items-center rounded-full border ' +
                          (added ? 'border-brand bg-brand text-white' : 'border-gray-300 text-transparent')
                        }
                      >
                        <Check className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-body text-gray-900">
                        <span className="font-medium">{e.name}</span>
                        {e.email && <span className="text-gray-500"> · {e.email}</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
