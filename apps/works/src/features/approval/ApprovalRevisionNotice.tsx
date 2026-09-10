import { useMemo } from 'react'
import type { ApprovalDetail } from '@/features/approval/approvalApi'
import { maxRound, stampLinesForRound } from '@/features/approval/stampRounds'

interface Props {
  /** 보완 요청으로 멈춰 고치러 온 문서. 아니면 아무것도 세우지 않는다. */
  document: ApprovalDetail | null | undefined
  active: boolean
  employees: { id: string; name: string }[] | undefined
}

/**
 * 보완 요청 안내 — 누가 무엇을 고쳐 달라고 했는가.
 *
 * **이 안내는 접지 않는다.** 지금 이 화면에 서 있는 이유이자 다음에 일어날 일을 말하는
 * 차단 안내라, 말풍선 뒤에 숨기면 고칠 곳을 모른 채 다시 올리게 된다
 * (안내 문구를 접는 규칙의 예외 — CLAUDE.md '안내 문구는 접는다').
 */
export function ApprovalRevisionNotice({ document, active, employees }: Props) {
  const info = useMemo(() => {
    if (!active || !document) return null
    const stamps = stampLinesForRound(document.approval_lines, maxRound(document.approval_lines))
    const requested = stamps.find((s) => s.decision === 'REVISION_REQUESTED')
    if (!requested) return null
    return {
      by: (employees ?? []).find((e) => e.id === requested.approverId)?.name ?? '결재자',
      comment: requested.comment,
    }
  }, [active, document, employees])

  if (!info) return null

  return (
    <div className="rounded-radius-md border border-warning-border bg-warning-subtle px-4 py-3">
      <p className="text-body font-medium text-gray-900">
        {info.by} 님이 보완을 요청했습니다. 수정 후 재상신하면 보완을 요청한 자리부터 결재가
        이어집니다.
      </p>
      {info.comment && (
        <p className="mt-1 whitespace-pre-wrap text-body-sm text-gray-700">
          보완 내용: {info.comment}
        </p>
      )}
    </div>
  )
}
