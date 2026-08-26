import { Button, Card, cn, tableText } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { ApprovalInfoTable, InfoLabelCell } from '@/features/approval/ApprovalInfoTable'
import { ApprovalLineModal } from '@/features/approval/ApprovalLineModal'
import type { ApprovalLineInput } from '@/features/approval/approvalApi'
import { LINE_KIND_LABEL } from '@/features/approval/config'
import { useEmployees } from '@/features/management/hooks'
import { useJobTitleLabel } from '@/features/management/jobTitleHooks'

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

/** 아직 아무도 없는 자리 — 완성된 문서에서 빈 도장 칸이 서는 높이를 그대로 잡아 둔다. */
function EmptyCell() {
  return <div className="min-h-[4.5rem]" />
}

/**
 * 기안 화면의 결재선 — **완성된 문서의 결재선 표와 같은 모양의 요약**이고, 실제 지정은
 * [결재선 설정] 창에서 한다.
 *
 * 이 자리에 입력 칸을 늘어놓지 않는 이유는 두 가지다. 하나는 결재선을 짜는 일(조직을 펼쳐
 * 사람을 찾고 자리와 순서를 정하는 일)이 문서를 쓰는 일과 종류가 달라 그 일에만 집중하는
 * 화면이 필요하다는 것이고, 다른 하나는 여기 남는 것이 **결과의 생김새**여야 한다는 것이다 —
 * 상신하고 나서야 자기가 만든 결재선의 모양을 처음 보게 되면 안 된다.
 */
export function ApprovalLinePicker({
  lines,
  onLinesChange,
  recipientIds,
  onRecipientsChange,
  excludeId,
}: ApprovalLinePickerProps) {
  const [open, setOpen] = useState(false)
  const { data: employees } = useEmployees()
  const jobTitle = useJobTitleLabel()

  const infoById = useMemo(() => {
    const m = new Map<string, { name: string; title: string }>()
    for (const e of employees ?? []) {
      const profile = (e.profile ?? {}) as Record<string, unknown>
      const rank = typeof profile.rank === 'string' ? profile.rank : ''
      const position = typeof profile.position === 'string' ? profile.position : ''
      m.set(e.id, { name: e.name, title: jobTitle(rank, position) })
    }
    return m
  }, [employees, jobTitle])

  const cells = (ids: string[]) => {
    if (ids.length === 0) return <EmptyCell />
    return (
      <div className="flex flex-wrap">
        {ids.map((id) => {
          const info = infoById.get(id)
          return (
            <div
              key={id}
              className="min-w-[6.5rem] flex-1 border-r border-gray-200 px-3 py-2 text-center last:border-r-0"
            >
              <p className={cn('mb-1', tableText.meta)}>{info?.title || ' '}</p>
              {/* 도장이 찍힐 자리. 상신 전이라 비어 있고, 높이만 완성된 문서와 같게 잡는다. */}
              <div className="h-9" />
              <p className={cn('mt-1', tableText.body)}>{info?.name ?? '(알 수 없음)'}</p>
            </div>
          )
        })}
      </div>
    )
  }

  const hasAgreement = lines.AGREEMENT.length > 0 || lines.FINANCE_AGREEMENT.length > 0

  return (
    <Card
      title="결재선"
      actions={
        <Button variant="outline" onClick={() => setOpen(true)}>
          결재선 설정
        </Button>
      }
    >
      <ApprovalInfoTable pairs={[]}>
        <tr>
          <InfoLabelCell>{LINE_KIND_LABEL.APPROVAL}</InfoLabelCell>
          <td className="border border-gray-200 p-0" colSpan={3}>
            {lines.APPROVAL.length === 0 ? (
              <p className={cn('px-3 py-4', tableText.empty)}>
                [결재선 설정]에서 결재자를 지정하세요.
              </p>
            ) : (
              cells(lines.APPROVAL)
            )}
          </td>
        </tr>

        {hasAgreement && (
          <tr>
            <InfoLabelCell>{LINE_KIND_LABEL.AGREEMENT}</InfoLabelCell>
            <td className="border border-gray-200 p-0">{cells(lines.AGREEMENT)}</td>
            <InfoLabelCell>{LINE_KIND_LABEL.FINANCE_AGREEMENT}</InfoLabelCell>
            <td className="border border-gray-200 p-0">{cells(lines.FINANCE_AGREEMENT)}</td>
          </tr>
        )}

        <tr>
          <InfoLabelCell className="align-top">참조</InfoLabelCell>
          <td className="border border-gray-200 px-3 py-2" colSpan={3}>
            {recipientIds.length === 0 ? (
              <p className={tableText.empty}>지정된 참조자가 없습니다.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {recipientIds.map((id) => (
                  <span key={id} className={tableText.body}>
                    {infoById.get(id)?.name ?? '(알 수 없음)'}
                  </span>
                ))}
              </div>
            )}
          </td>
        </tr>
      </ApprovalInfoTable>

      <ApprovalLineModal
        open={open}
        lines={lines}
        recipientIds={recipientIds}
        excludeId={excludeId}
        onClose={() => setOpen(false)}
        onConfirm={(nextLines, nextCc) => {
          onLinesChange(nextLines)
          onRecipientsChange(nextCc)
          setOpen(false)
        }}
      />
    </Card>
  )
}
