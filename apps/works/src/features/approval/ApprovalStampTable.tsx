import { cn } from '@ynarcher/ui'
import { Check } from 'lucide-react'
import { ApprovalLineGrid, type GridPerson } from '@/features/approval/ApprovalLineGrid'
import { approvalText, type ApprovalLineKind } from '@/features/approval/config'

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

interface ApprovalStampTableProps {
  lines: StampLine[]
  recipients: StampRecipient[]
  /** 기안자 — 결재 행의 맨 앞 칸을 항상 차지한다. */
  drafterId: string | null
  /** 기안 일시(기안자 도장 아래 날짜). */
  draftedAt: string | null
  nameOf: (id: string | null) => string
  /** 직급·직책 표기(있으면 도장 위 칸에 적는다). */
  titleOf?: (id: string | null) => string
  className?: string
}

/**
 * 도장 종류 — 결재선 한 칸에 찍힐 수 있는 표식의 전부다.
 *
 * 넷이 같은 원형에 **글자만 갈린다**(아이콘을 쓰지 않는 이유: 종이 결재의 도장은 글자이고,
 * 체크·엑스는 '읽는' 것이 아니라 '보는' 기호라 승인·반려·기안·대기가 한 축으로 읽히지 않는다).
 *
 * 종이 도장이 그렇듯 **속은 비우고 테두리와 글자를 같은 한 가지 색**으로 찍는다. 그래서 톤이
 * 정하는 것은 글자색 하나뿐이고, 테두리는 `border-current`로 그 색을 그대로 따라간다 —
 * 둘을 각각 적던 동안에는 테두리(`*-border`)와 글자(`text-*`)가 서로 다른 색이었다.
 *
 * `대기`도 같은 실선 원을 쓰되 색만 물러난다 — 찍히지 않은 자리라는 것은 형태가 아니라
 * 색이 답한다. 일시는 비운다(결정이 없으니 날짜도 없다).
 */
const STAMP_TONE = {
  DRAFT: 'text-info',
  APPROVED: 'text-info',
  REJECTED: 'text-danger',
  // 대기만 테두리를 글자보다 한 단 더 옅게(gray-300, 표준 헤어라인) 물린다. 원이 물러나면
  // 칸 전체가 확실히 가라앉는데, 글자까지 같이 내리면 흰 배경에서 1.35:1이라 '대기'가
  // 읽히지 않는다 — 누구 차례인지를 알려주는 글자라 읽히지 않으면 안 된다.
  PENDING: 'text-gray-400 border-gray-300',
} as const

/** 도장 한 칸 — 원형 표식과 그 아래 일시. 일시가 없으면 표식만 선다. */
function StampMark({
  label,
  tone,
  date,
}: {
  label: string
  tone: keyof typeof STAMP_TONE
  date: string | null
}) {
  return (
    <span className="inline-flex flex-col items-center gap-2">
      <span
        className={cn(
          'flex size-10 items-center justify-center rounded-full border-2 border-current bg-white font-bold',
          STAMP_TONE[tone],
        )}
      >
        {label}
      </span>
      {/* 일시 자리는 도장이 찍혔을 때만 만든다 — 빈 줄을 두면 대기 칸만 키가 커진다. */}
      {date && <span className={approvalText.meta}>{date.slice(0, 10)}</span>}
    </span>
  )
}

const DECISION_LABEL: Record<StampLine['decision'], string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
}

function Stamp({ line }: { line: StampLine }) {
  return (
    <StampMark
      label={DECISION_LABEL[line.decision]}
      tone={line.decision}
      date={line.decision === 'PENDING' ? null : line.decidedAt}
    />
  )
}

/**
 * 완성된 문서의 결재선 표 — 골격은 ApprovalLineGrid가 소유하고, 여기서는 결재선 원장을
 * 격자의 사람 칸(직급/도장/이름)으로 변환만 한다.
 *
 * 예전에는 문서 머리 격자(ApprovalInfoTable) 안에 `<tr>`로 이어 붙였지만, 결재선 격자는
 * 열 골격(라벨 1 + 데이터 8)이 머리 격자(라벨:값 4열)와 달라 한 표 안에서는 두 골격이
 * 공존할 수 없다. 표를 분리하고 `-mt-px`로 이어 붙이면 종이 양식처럼 한 장으로 읽힌다.
 *
 * 참조자는 결재하지 않으므로 도장 칸을 차지하지 않고 이름과 열람 확인 표식만 늘어놓는다.
 */
export function ApprovalStampTable({
  lines,
  recipients,
  drafterId,
  draftedAt,
  nameOf,
  titleOf,
  className,
}: ApprovalStampTableProps) {
  const of = (kind: ApprovalLineKind) => lines.filter((l) => (l.kind ?? 'APPROVAL') === kind)
  const toPerson = (line: StampLine, seq?: number): GridPerson => ({
    key: line.id,
    title: titleOf?.(line.approverId) ?? '',
    name: nameOf(line.approverId),
    seq,
    stamp: <Stamp line={line} />,
  })

  // 결재 행의 맨 앞은 항상 기안자 — 문서를 낸 사람이 결재선의 출발점이다. 결재자가 아니라
  // 순번은 붙이지 않고, 그 뒤의 결재자들만 순번대로 세운다(합의는 병렬이라 차례 그대로).
  const drafter: GridPerson[] = drafterId
    ? [
        {
          key: `drafter-${drafterId}`,
          title: titleOf?.(drafterId) ?? '',
          name: nameOf(drafterId),
          stamp: <StampMark label="기안" tone="DRAFT" date={draftedAt} />,
        },
      ]
    : []
  const approval = [
    ...drafter,
    ...[...of('APPROVAL')]
      .sort((a, b) => a.stepOrder - b.stepOrder)
      .map((l, i) => toPerson(l, i + 1)),
  ]
  const agreement = of('AGREEMENT').map((l) => toPerson(l))
  const finance = of('FINANCE_AGREEMENT').map((l) => toPerson(l))

  return (
    <ApprovalLineGrid
      className={className}
      approval={approval}
      agreement={agreement}
      finance={finance}
      cc={
        recipients.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {recipients.map((r) => (
              <span
                key={r.userId}
                className={cn('inline-flex items-center gap-1', approvalText.body)}
              >
                {nameOf(r.userId)}
                {/* 열람 확인 — 읽은 사람만 표식이 붙는다(안 읽었으면 아무 것도 적지 않는다). */}
                {r.read && <Check size={13} className="text-info" strokeWidth={2.5} />}
              </span>
            ))}
          </div>
        ) : undefined
      }
    />
  )
}
