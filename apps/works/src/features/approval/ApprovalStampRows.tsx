import { cn, tableText } from '@ynarcher/ui'
import { Check, X } from 'lucide-react'
import { InfoLabelCell } from '@/features/approval/ApprovalInfoTable'
import {
  LINE_KIND_LABEL,
  isSequentialKind,
  type ApprovalLineKind,
} from '@/features/approval/config'

export interface StampLine {
  id: string
  approverId: string | null
  stepOrder: number
  decision: 'PENDING' | 'APPROVED' | 'REJECTED'
  kind: ApprovalLineKind
  decidedAt: string | null
}

export interface StampRecipient {
  userId: string
  read: boolean
}

interface ApprovalStampRowsProps {
  lines: StampLine[]
  recipients: StampRecipient[]
  nameOf: (id: string | null) => string
  /** 직급·직책 표기(있으면 도장 위 칸에 적는다). */
  titleOf?: (id: string | null) => string
}

/** 도장 한 칸 — 결재 여부를 원형 표식으로, 일시를 그 아래에 적는다. */
function Stamp({ line }: { line: StampLine }) {
  if (line.decision === 'PENDING') {
    return <span className={cn('text-caption', tableText.empty)}>대기</span>
  }
  const approved = line.decision === 'APPROVED'
  return (
    <span className="inline-flex flex-col items-center gap-1">
      <span
        className={cn(
          'flex size-9 items-center justify-center rounded-full border-2 text-caption font-bold',
          approved
            ? 'border-info-border bg-info-subtle text-info'
            : 'border-danger-border bg-danger-subtle text-danger',
        )}
      >
        {approved ? <Check size={16} strokeWidth={2.5} /> : <X size={16} strokeWidth={2.5} />}
      </span>
      <span className={cn('text-caption', tableText.meta)}>
        {line.decidedAt?.slice(0, 10) ?? ''}
      </span>
    </span>
  )
}

/** 한 구분의 도장 칸들을 가로로 편다(칸이 없으면 빈 자리로 남긴다). */
function StampCells({
  kind,
  lines,
  nameOf,
  titleOf,
}: {
  kind: ApprovalLineKind
  lines: StampLine[]
  nameOf: (id: string | null) => string
  titleOf?: (id: string | null) => string
}) {
  // 결재만 순번대로 세운다 — 합의는 병렬이라 순서가 판정에 쓰이지 않으므로 지정한 차례 그대로 둔다.
  const ordered = isSequentialKind(kind)
    ? [...lines].sort((a, b) => a.stepOrder - b.stepOrder)
    : lines

  if (ordered.length === 0) return <div className="min-h-[4.5rem]" />

  return (
    <div className="flex flex-wrap">
      {ordered.map((line) => (
        <div
          key={line.id}
          className="min-w-[6.5rem] flex-1 border-r border-gray-200 px-3 py-2 text-center last:border-r-0"
        >
          <p className={cn('mb-1', tableText.meta)}>{titleOf?.(line.approverId) || ' '}</p>
          <Stamp line={line} />
          <p className={cn('mt-1', tableText.body)}>{nameOf(line.approverId)}</p>
        </div>
      ))}
    </div>
  )
}

/**
 * 결재선 도장 행 — 문서 머리 격자(ApprovalInfoTable) 안에 이어 붙는 `<tr>`들이다.
 *
 * 별도 표로 떼어 놓으면 정보 격자와 도장 칸 사이에 선이 두 겹으로 겹치고 폭도 따로 논다.
 * 종이 결재 양식이 그렇듯 한 표 안에서 이어지는 것이 맞다.
 *
 * 구분마다 한 줄을 차지한다(결재 → 합의 → 재무합의 → 참조). 비어 있는 구분은 줄을 만들지
 * 않는다 — 합의가 없는 문서에 빈 '합의' 칸이 남으면 누군가 빠뜨린 것처럼 읽힌다.
 *
 * 한 사람은 세 단으로 이룬다: 직책 / 도장(결재 여부·일시) / 이름. 참조자는 결재하지 않으므로
 * 도장 칸을 차지하지 않고 이름과 열람 확인 표식만 한 줄에 늘어놓는다.
 */
export function ApprovalStampRows({
  lines,
  recipients,
  nameOf,
  titleOf,
}: ApprovalStampRowsProps) {
  const of = (kind: ApprovalLineKind) => lines.filter((l) => (l.kind ?? 'APPROVAL') === kind)
  const approval = of('APPROVAL')
  const agreement = of('AGREEMENT')
  const finance = of('FINANCE_AGREEMENT')
  // 합의 행은 둘 중 하나라도 있으면 세운다. 안에서는 두 자리를 늘 함께 보인다 —
  // 재무합의만 있는 문서에서 '합의' 칸이 비어 있는 것 자체가 읽어야 할 사실이다.
  const hasAgreementRow = agreement.length > 0 || finance.length > 0

  return (
    <>
      <tr>
        <InfoLabelCell>{LINE_KIND_LABEL.APPROVAL}</InfoLabelCell>
        <td className="border border-gray-200 p-0" colSpan={3}>
          {approval.length === 0 ? (
            <p className={cn('px-3 py-4', tableText.empty)}>지정된 결재선이 없습니다.</p>
          ) : (
            <StampCells kind="APPROVAL" lines={approval} nameOf={nameOf} titleOf={titleOf} />
          )}
        </td>
      </tr>

      {hasAgreementRow && (
        <tr>
          <InfoLabelCell>{LINE_KIND_LABEL.AGREEMENT}</InfoLabelCell>
          <td className="border border-gray-200 p-0">
            <StampCells kind="AGREEMENT" lines={agreement} nameOf={nameOf} titleOf={titleOf} />
          </td>
          <InfoLabelCell>{LINE_KIND_LABEL.FINANCE_AGREEMENT}</InfoLabelCell>
          <td className="border border-gray-200 p-0">
            <StampCells
              kind="FINANCE_AGREEMENT"
              lines={finance}
              nameOf={nameOf}
              titleOf={titleOf}
            />
          </td>
        </tr>
      )}

      {recipients.length > 0 && (
        <tr>
          <InfoLabelCell className="align-top">참조</InfoLabelCell>
          <td className="border border-gray-200 px-3 py-2" colSpan={3}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {recipients.map((r) => (
                <span
                  key={r.userId}
                  className={cn('inline-flex items-center gap-1', tableText.body)}
                >
                  {nameOf(r.userId)}
                  {/* 열람 확인 — 읽은 사람만 표식이 붙는다(안 읽었으면 아무 것도 적지 않는다). */}
                  {r.read && <Check size={13} className="text-info" strokeWidth={2.5} />}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
