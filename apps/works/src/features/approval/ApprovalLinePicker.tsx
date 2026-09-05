import { Button, Card, cn } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { ApprovalLineGrid, type GridPerson } from '@/features/approval/ApprovalLineGrid'
import { ApprovalLineModal } from '@/features/approval/ApprovalLineModal'
import type { ApprovalLineInput } from '@/features/approval/approvalApi'
import { approvalText } from '@/features/approval/config'
import { useEmployees } from '@/features/management/hooks'
import { useJobTitleLabel } from '@/features/management/jobTitleHooks'

interface ApprovalLinePickerProps {
  /** 구분별 결재선(결재는 배열 순서가 곧 순번). */
  lines: ApprovalLineInput
  onLinesChange: (lines: ApprovalLineInput) => void
  /** 참조자(결재하지 않고 열람만). */
  recipientIds: string[]
  onRecipientsChange: (ids: string[]) => void
  /** 기안자 본인 — 결재 행의 맨 앞 칸을 항상 차지한다(결재자로도 지정할 수 있다). */
  drafterId?: string | null
  /**
   * 결재선을 고칠 수 없는 자리(재상신). 되돌린 사람이 지정한 재개 지점은 **그 결재선을
   * 전제로 한 판단**이라, 기안자가 사람을 갈아끼우면 "3번부터"가 누구를 가리키는지 알 수
   * 없게 된다. 자리는 그대로 보이고 고치는 문만 닫는다 — 감춰 버리면 재상신하는 사람이
   * 자기 문서가 누구에게 갈지 모른 채 올린다.
   */
  readOnly?: boolean
  /** 제목 줄 도움말(재상신에서 왜 못 고치는지). */
  help?: string
}

/**
 * 기안 화면의 결재선 — **완성된 문서의 결재선 표와 같은 골격(ApprovalLineGrid)의 미리보기**이고,
 * 실제 지정은 [결재선 설정] 창에서 한다.
 *
 * 이 자리에 입력 칸을 늘어놓지 않는 이유는 두 가지다. 하나는 결재선을 짜는 일(조직을 펼쳐
 * 사람을 찾고 자리와 순서를 정하는 일)이 문서를 쓰는 일과 종류가 달라 그 일에만 집중하는
 * 화면이 필요하다는 것이고, 다른 하나는 여기 남는 것이 **결과의 생김새**여야 한다는 것이다 —
 * 상신하고 나서야 자기가 만든 결재선의 모양을 처음 보게 되면 안 된다. 도장 칸은 비워 둔다
 * (상신 전이니 도장이 있을 리 없다). 결재 행의 맨 앞은 항상 기안자 본인이다.
 */
export function ApprovalLinePicker({
  lines,
  onLinesChange,
  recipientIds,
  onRecipientsChange,
  drafterId,
  readOnly,
  help,
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

  const toPerson = (id: string, seq?: number): GridPerson => {
    const info = infoById.get(id)
    return {
      key: id,
      title: info?.title ?? '',
      name: info?.name ?? '(알 수 없음)',
      seq,
      stamp: null,
    }
  }

  return (
    <Card
      title="결재선"
      help={help}
      actions={
        readOnly ? undefined : (
          <Button variant="outline" onClick={() => setOpen(true)}>
            결재선설정
          </Button>
        )
      }
    >
      <ApprovalLineGrid
        // 맨 앞은 기안자 본인(순번 없음), 그 뒤로 지정한 결재자들이 순번대로 선다.
        approval={[
          ...(drafterId ? [toPerson(drafterId)] : []),
          ...lines.APPROVAL.map((id, i) => toPerson(id, i + 1)),
        ]}
        // 합의·재무합의도 자기 줄 안에서 순차라 순번이 붙는다(참조만 순서를 갖지 않는다).
        agreement={lines.AGREEMENT.map((id, i) => toPerson(id, i + 1))}
        finance={lines.FINANCE_AGREEMENT.map((id, i) => toPerson(id, i + 1))}
        cc={
          recipientIds.length === 0 && readOnly ? (
            <span className={approvalText.empty}>-</span>
          ) : recipientIds.length === 0 ? (
            // 결재선처럼 클릭해서 바로 채우는 자리 — 안내문 대신 빈 입력칸 모양으로 둔다.
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn(
                'w-full rounded-radius-sm border border-dashed border-gray-300 px-3 py-1.5 text-left hover:border-gray-400',
                approvalText.empty,
              )}
            >
              클릭 후 입력
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {recipientIds.map((id) => (
                <span key={id} className={approvalText.body}>
                  {infoById.get(id)?.name ?? '(알 수 없음)'}
                </span>
              ))}
            </div>
          )
        }
      />

      <ApprovalLineModal
        open={open}
        lines={lines}
        recipientIds={recipientIds}
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
