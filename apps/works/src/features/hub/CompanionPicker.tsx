import { TokenMultiSelect } from '@ynarcher/ui'
import { useMemo } from 'react'
import { useEmployees } from '@/features/hub/hooks'
import type { EventCompanion } from '@/features/hub/hooks'

/**
 * 업무 일정 동행자(내부 임직원) 선택기. 표준 토큰 입력(TokenMultiSelect)을 감싸 임직원을
 * 검색해 칩으로 추가한다. 선택 칩은 입력 필드 안에 인라인으로 남고, 칩을 눌러 제거한다.
 */
export function CompanionPicker({
  selected,
  onChange,
}: {
  selected: EventCompanion[]
  onChange: (next: EventCompanion[]) => void
}) {
  const { data: employees } = useEmployees()
  const list = employees ?? []
  const byId = useMemo(() => new Map(list.map((e) => [e.id, e] as const)), [list])
  const options = useMemo<EventCompanion[]>(
    () => list.map((e) => ({ id: e.id, name: e.name })),
    [list],
  )

  return (
    <TokenMultiSelect<EventCompanion>
      selected={selected}
      onChange={onChange}
      options={options}
      getKey={(c) => c.id}
      getLabel={(c) => c.name}
      getMeta={(c) => byId.get(c.id)?.email ?? undefined}
      placeholder="동행자 이름 검색"
    />
  )
}
