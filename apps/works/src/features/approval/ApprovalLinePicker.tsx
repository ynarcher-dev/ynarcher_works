import { Field, TokenMultiSelect, cardText } from '@ynarcher/ui'
import { useMemo } from 'react'
import { useEmployees } from '@/features/management/hooks'

interface PickerPerson {
  id: string
  name: string
}

interface ApprovalLinePickerProps {
  /** 결재선(순서 = 결재 순번). */
  approverIds: string[]
  onApproversChange: (ids: string[]) => void
  /** 참조자(순서 없음). */
  recipientIds: string[]
  onRecipientsChange: (ids: string[]) => void
  /** 결재선에서 제외할 사람(대개 기안자 본인). */
  excludeId?: string | null
}

/**
 * 결재선·참조 지정.
 *
 * 결재선은 **고른 순서가 곧 결재 순번**이다 — 순번을 따로 입력받으면 사람이 1·2·3을 맞춰
 * 적어야 하고 중간을 지우면 번호가 어긋난다. 칩이 놓인 왼쪽부터 1차·2차이며, 그 순서를
 * 화면이 번호로 되읽어 준다.
 *
 * 참조는 결재하지 않고 열람만 하는 사람이라 순서가 뜻을 갖지 않는다.
 */
export function ApprovalLinePicker({
  approverIds,
  onApproversChange,
  recipientIds,
  onRecipientsChange,
  excludeId,
}: ApprovalLinePickerProps) {
  const { data: employees } = useEmployees()

  const people = useMemo<PickerPerson[]>(
    () =>
      (employees ?? [])
        .filter((e) => e.id !== excludeId)
        .map((e) => ({ id: e.id, name: e.name })),
    [employees, excludeId],
  )

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const toPeople = (ids: string[]) =>
    ids.map((id) => byId.get(id) ?? { id, name: '(알 수 없음)' })

  return (
    <div className="space-y-4">
      <Field
        as="div"
        label="결재선"
        required
        hint="고른 순서대로 1차·2차 결재가 진행됩니다."
      >
        <TokenMultiSelect
          selected={toPeople(approverIds)}
          onChange={(next) => onApproversChange(next.map((p) => p.id))}
          options={people}
          getKey={(p) => p.id}
          getLabel={(p) => p.name}
          placeholder="결재자 검색 후 추가"
          browsable
        />
        {approverIds.length > 0 && (
          <p className={`mt-2 ${cardText.meta}`}>
            {toPeople(approverIds)
              .map((p, i) => `${i + 1}차 ${p.name}`)
              .join(' → ')}
          </p>
        )}
      </Field>

      <Field as="div" label="참조" hint="결재하지 않고 문서를 열람합니다.">
        <TokenMultiSelect
          selected={toPeople(recipientIds)}
          onChange={(next) => onRecipientsChange(next.map((p) => p.id))}
          options={people}
          getKey={(p) => p.id}
          getLabel={(p) => p.name}
          placeholder="참조자 검색 후 추가"
          browsable
        />
      </Field>
    </div>
  )
}
