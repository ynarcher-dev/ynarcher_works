import { TokenMultiSelect, cardText, cn, tableText } from '@ynarcher/ui'
import { useMemo } from 'react'
import { InfoLabelCell } from '@/features/approval/ApprovalInfoTable'
import type { ApprovalLineInput } from '@/features/approval/approvalApi'
import { LINE_KIND_LABEL, LINE_KIND_ORDER } from '@/features/approval/config'
import { useEmployees } from '@/features/management/hooks'

interface PickerPerson {
  id: string
  name: string
}

interface ApprovalLinePickerProps {
  /** 구분별 결재선(결재는 배열 순서가 곧 순번). */
  lines: ApprovalLineInput
  onLinesChange: (lines: ApprovalLineInput) => void
  /** 참조자(결재하지 않고 열람만). */
  recipientIds: string[]
  onRecipientsChange: (ids: string[]) => void
  /** 결재선에서 제외할 사람(대개 기안자 본인). */
  excludeId?: string | null
}

/**
 * 결재선·참조 지정 — 결재 / 합의 · 재무합의 / 참조.
 *
 * **지정 화면이 완성된 문서의 결재선 표와 같은 모양이다.** 문서에 찍힐 도장 칸이 어디에 서는지를
 * 지정하는 동안에도 그대로 보게 하려는 것이다 — 세로로 늘어선 입력 칸으로 받으면 상신하고 나서야
 * 자기가 만든 결재선의 생김새를 처음 보게 된다.
 *
 * **결재**는 고른 순서가 곧 결재 순번이다. 순번을 따로 입력받으면 사람이 1·2·3을 맞춰 적어야 하고
 * 중간을 지우면 번호가 어긋난다. **합의·재무합의**는 병렬이라 순서가 뜻을 갖지 않는다 — 순서를
 * 강제하면 합의자가 자리를 비운 동안 결재 전체가 멈춘다. **참조**는 결재하지 않고 열람만 한다.
 *
 * 같은 사람을 두 자리에 넣지 않는다 — 한 사람이 결재와 합의를 겹쳐 갖고 있으면 도장을 두 번
 * 찍어야 하고, 그 둘이 어긋났을 때 문서의 뜻이 갈린다.
 */
export function ApprovalLinePicker({
  lines,
  onLinesChange,
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

  // 이미 다른 결재선 자리에 있는 사람은 후보에서 뺀다.
  const optionsFor = (kind: keyof ApprovalLineInput) => {
    const taken = new Set(LINE_KIND_ORDER.filter((k) => k !== kind).flatMap((k) => lines[k]))
    return people.filter((p) => !taken.has(p.id))
  }

  const picker = (kind: keyof ApprovalLineInput) => (
    <TokenMultiSelect
      density="table"
      selected={toPeople(lines[kind])}
      onChange={(next) => onLinesChange({ ...lines, [kind]: next.map((p) => p.id) })}
      options={optionsFor(kind)}
      getKey={(p) => p.id}
      getLabel={(p) => p.name}
      placeholder={`${LINE_KIND_LABEL[kind]}자 검색 후 추가`}
      browsable
    />
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse">
        <tbody>
          <tr>
            <InfoLabelCell>{LINE_KIND_LABEL.APPROVAL}</InfoLabelCell>
            <td className="border border-gray-200 px-3 py-2" colSpan={3}>
              {picker('APPROVAL')}
              {lines.APPROVAL.length > 0 && (
                <p className={cn('mt-2', cardText.meta)}>
                  {toPeople(lines.APPROVAL)
                    .map((p, i) => `${i + 1}차 ${p.name}`)
                    .join(' → ')}
                </p>
              )}
            </td>
          </tr>

          <tr>
            <InfoLabelCell>{LINE_KIND_LABEL.AGREEMENT}</InfoLabelCell>
            <td className="border border-gray-200 px-3 py-2">{picker('AGREEMENT')}</td>
            <InfoLabelCell>{LINE_KIND_LABEL.FINANCE_AGREEMENT}</InfoLabelCell>
            <td className="border border-gray-200 px-3 py-2">{picker('FINANCE_AGREEMENT')}</td>
          </tr>

          <tr>
            <InfoLabelCell>참조</InfoLabelCell>
            <td className="border border-gray-200 px-3 py-2" colSpan={3}>
              <TokenMultiSelect
                density="table"
                selected={toPeople(recipientIds)}
                onChange={(next) => onRecipientsChange(next.map((p) => p.id))}
                options={people}
                getKey={(p) => p.id}
                getLabel={(p) => p.name}
                placeholder="참조자 검색 후 추가"
                browsable
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p className={cn('mt-2', tableText.meta)}>
        결재는 고른 순서대로 진행되고, 합의·재무합의는 순서 없이 동시에 검토합니다.
      </p>
    </div>
  )
}
