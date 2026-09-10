import {
  Button,
  Field,
  Input,
  Modal,
  PickList,
  PickMark,
  PickRow,
  TransferPanes,
} from '@ynarcher/ui'
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
 * 내부 인원(참석자·참조) 검색 전용 모달. 왼쪽 임직원 원장에서 이름·이메일로 찾고, 오른쪽에서
 * 현재 명단을 확인한다. 생성 기능은 없다(임직원은 MANAGEMENT 원장이 소유). 인라인 피커와
 * 동일하게 한 사람은 참석자·참조 중 한쪽에만 들어가도록 다른 역할에 있는 사람은 제외한다.
 */
export function InternalPeopleSearchModal({ open, onClose, role, people, onChange, title }: Props) {
  const { data: employees } = useEmployees()
  const [keyword, setKeyword] = useState('')
  const [checkedLeft, setCheckedLeft] = useState<string[]>([])
  const [checkedRight, setCheckedRight] = useState<string[]>([])

  const employeeById = useMemo(
    () => new Map((employees ?? []).map((employee) => [employee.id, employee] as const)),
    [employees],
  )

  const otherRoleIds = useMemo(
    () => new Set(people.filter((p) => p.role !== role).map((p) => p.userId)),
    [people, role],
  )
  const sameRoleIds = useMemo(
    () => new Set(people.filter((p) => p.role === role).map((p) => p.userId)),
    [people, role],
  )

  const selectedIds = useMemo(
    () => new Set(people.filter((p) => p.role === role).map((p) => p.userId)),
    [people, role],
  )

  const candidates = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return (employees ?? [])
      .filter((e) => !otherRoleIds.has(e.id) && !selectedIds.has(e.id))
      .filter(
        (e) =>
          kw === '' ||
          e.name.toLowerCase().includes(kw) ||
          (e.email ?? '').toLowerCase().includes(kw),
      )
      .slice(0, 50)
  }, [employees, keyword, otherRoleIds, selectedIds])

  const selectedPeople = useMemo(
    () =>
      people
        .filter((person) => person.role === role)
        .map((person) => {
          const employee = employeeById.get(person.userId)
          return {
            id: person.userId,
            name: employee?.name ?? '알 수 없음',
            email: employee?.email ?? null,
          }
        }),
    [employeeById, people, role],
  )

  const toggleChecked = (
    ids: string[],
    setIds: (next: string[]) => void,
    id: string,
  ) => setIds(ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id])

  const moveRight = (ids: string[]) => {
    const added = ids
      .filter((id) => !sameRoleIds.has(id))
      .map((userId) => ({ userId, role }))
    if (added.length > 0) onChange([...people, ...added])
    setCheckedLeft([])
  }

  const moveLeft = (ids: string[]) => {
    const removed = new Set(ids)
    onChange(
      people.filter((person) => person.role !== role || !removed.has(person.userId)),
    )
    setCheckedRight([])
  }

  const close = () => {
    setKeyword('')
    setCheckedLeft([])
    setCheckedRight([])
    onClose()
  }

  const selectedTitle = role === 'ATTENDEE' ? '회의 참석자' : '참조 대상'

  return (
    <Modal
      open={open}
      onClose={close}
      size="3xl"
      sectioned
      title={title}
      footer={
        <Button variant="secondary" onClick={close}>
          닫기
        </Button>
      }
    >
      <TransferPanes
        left={{
          title: '임직원 원장',
          count: candidates.length,
          children: (
            <div className="space-y-3">
              <Field label="검색">
                <Input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="이름 또는 이메일로 임직원 검색"
                  aria-label="임직원 검색"
                  autoFocus
                />
              </Field>
              <div className="min-h-[3rem] overflow-hidden rounded-radius-md border border-gray-200">
                <PickList isEmpty={candidates.length === 0} empty="일치하는 임직원이 없습니다.">
                  {candidates.map((employee) => {
                    const checked = checkedLeft.includes(employee.id)
                    return (
                      <PickRow
                        key={employee.id}
                        selected={checked}
                        onClick={() =>
                          toggleChecked(checkedLeft, setCheckedLeft, employee.id)
                        }
                      >
                        <PickMark checked={checked}>
                          <Check className="size-3.5" />
                        </PickMark>
                        <span className="min-w-0 flex-1 truncate text-body text-gray-900">
                          <span className="font-medium">{employee.name}</span>
                          {employee.email && (
                            <span className="text-gray-500"> · {employee.email}</span>
                          )}
                        </span>
                      </PickRow>
                    )
                  })}
                </PickList>
              </div>
            </div>
          ),
        }}
        right={{
          title: selectedTitle,
          count: selectedPeople.length,
          children: (
            <div className="min-h-[3rem] overflow-hidden rounded-radius-md border border-gray-200">
              <PickList isEmpty={selectedPeople.length === 0} empty="왼쪽에서 임직원을 골라 넣어 주세요.">
                {selectedPeople.map((employee) => {
                  const checked = checkedRight.includes(employee.id)
                  return (
                    <PickRow
                      key={employee.id}
                      selected={checked}
                      onClick={() => toggleChecked(checkedRight, setCheckedRight, employee.id)}
                    >
                      <PickMark checked={checked}>
                        <Check className="size-3.5" />
                      </PickMark>
                      <span className="min-w-0 flex-1 truncate text-body text-gray-900">
                        <span className="font-medium">{employee.name}</span>
                        {employee.email && (
                          <span className="text-gray-500"> · {employee.email}</span>
                        )}
                      </span>
                    </PickRow>
                  )
                })}
              </PickList>
            </div>
          ),
        }}
        toRight={{
          count: checkedLeft.length,
          onMove: () => moveRight(checkedLeft),
          onMoveAll: () => moveRight(candidates.map((employee) => employee.id)),
          allDisabled: candidates.length === 0,
        }}
        toLeft={{
          count: checkedRight.length,
          onMove: () => moveLeft(checkedRight),
          onMoveAll: () => moveLeft(selectedPeople.map((employee) => employee.id)),
          allDisabled: selectedPeople.length === 0,
        }}
      />
    </Modal>
  )
}
