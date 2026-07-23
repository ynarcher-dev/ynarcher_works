import { TokenMultiSelect } from '@ynarcher/ui'
import { useMemo } from 'react'
import { useEmployees } from '@/features/hub/hooks'
import type { MinutePersonRole } from '@/features/office/minutes/minutesApi'

export interface PickerPerson {
  userId: string
  role: MinutePersonRole
}

interface Sel {
  userId: string
  name: string
}

interface Props {
  /** 이 피커가 담당하는 역할(참석자 또는 참조). */
  role: MinutePersonRole
  /** 회의록의 전체 내부 인원(참석자+참조) — 역할 간 중복 방지에 함께 쓴다. */
  people: PickerPerson[]
  /** 전체 목록을 갱신해 돌려준다. */
  onChange: (next: PickerPerson[]) => void
  placeholder?: string
}

/**
 * 회의록 내부 인원(참석자 또는 참조) 지정 피커. 역할별로 하나씩 배치한다.
 * 표준 토큰 입력(TokenMultiSelect)을 감싸며, 한 사람은 참석자·참조 중 한쪽에만 들어가도록
 * 다른 역할에 이미 있는 사람은 후보에서 제외한다(DB unique(minute_id,user_id)와 일치).
 */
export function InternalPersonPicker({ role, people, onChange, placeholder }: Props) {
  const { data: employees } = useEmployees()
  const list = employees ?? []
  const byId = useMemo(() => new Map(list.map((e) => [e.id, e] as const)), [list])

  const otherRoleIds = useMemo(
    () => new Set(people.filter((p) => p.role !== role).map((p) => p.userId)),
    [people, role],
  )
  const selected: Sel[] = people
    .filter((p) => p.role === role)
    .map((p) => ({ userId: p.userId, name: byId.get(p.userId)?.name ?? '알 수 없음' }))
  const options: Sel[] = list
    .filter((e) => !otherRoleIds.has(e.id))
    .map((e) => ({ userId: e.id, name: e.name }))

  const handle = (next: Sel[]) => {
    const others = people.filter((p) => p.role !== role)
    onChange([...others, ...next.map((s) => ({ userId: s.userId, role }))])
  }

  return (
    <TokenMultiSelect<Sel>
      selected={selected}
      onChange={handle}
      options={options}
      getKey={(s) => s.userId}
      getLabel={(s) => s.name}
      getMeta={(s) => byId.get(s.userId)?.email ?? undefined}
      placeholder={placeholder ?? '임직원 검색 후 추가'}
    />
  )
}
