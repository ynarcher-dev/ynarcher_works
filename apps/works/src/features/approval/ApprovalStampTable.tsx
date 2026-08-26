import { cn } from '@ynarcher/ui'
import { Check, MessageSquareText } from 'lucide-react'
import { ApprovalLineGrid, type GridPerson } from '@/features/approval/ApprovalLineGrid'
import { LINE_KIND_LABEL, approvalText, type ApprovalLineKind } from '@/features/approval/config'

export interface StampLine {
  id: string
  approverId: string | null
  stepOrder: number
  decision: 'PENDING' | 'APPROVED' | 'REJECTED'
  kind: ApprovalLineKind
  decidedAt: string | null
  /** 처리하며 남긴 의견(없으면 null). 있으면 도장이 눌러서 읽는 자리가 된다. */
  comment: string | null
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
  /**
   * 지금 내가 찍을 수 있는 결재선 행 id. 이 칸의 도장만 '대기'가 아니라 누를 수 있는
   * [처리] 자리로 바뀐다(차례가 아니면 null — 판정은 화면이 아니라 model.isMyTurn이 한다).
   */
  actionableLineId?: string | null
  /** [처리] 자리를 눌렀을 때. 실제 결정은 결재 처리 창에서 한 번 더 고른다. */
  onAction?: () => void
  /**
   * 의견이 남은 도장을 눌렀을 때. 넘기지 않으면 도장은 읽기만 하는 표식으로 남는다
   * (기안 미리보기처럼 아직 아무 처리도 없는 자리).
   */
  onOpenComment?: (lineId: string) => void
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
  hasComment,
}: {
  label: string
  tone: keyof typeof STAMP_TONE
  date: string | null
  /** 의견이 남았음을 알리는 말풍선 표식을 일시 옆에 세운다. */
  hasComment?: boolean
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
      {/* 일시 자리는 도장이 찍혔을 때만 만든다 — 빈 줄을 두면 대기 칸만 키가 커진다.
          말풍선은 그 줄에 얹는다: 언제 처리했는가와 무엇이라 했는가는 같은 도장에 붙은
          한 사실이라, 표식을 따로 세우면 칸이 한 단 더 길어지고 격자의 키가 들쭉날쭉해진다. */}
      {date && (
        <span className={cn('inline-flex items-center gap-1', approvalText.meta)}>
          {date.slice(0, 10)}
          {hasComment && <MessageSquareText size={13} className="text-gray-500" />}
        </span>
      )}
    </span>
  )
}

const DECISION_LABEL: Record<StampLine['decision'], string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
}

/**
 * 찍힌 도장 한 칸. **의견이 남았으면 눌러서 읽는 자리**가 되고, 그 사실을 일시 옆의 말풍선
 * 표식이 알린다 — 눌러야만 알 수 있는 내용은 눌러 볼 이유도 함께 보여야 한다.
 *
 * 의견이 없는 도장은 누를 수 없게 둔다. 전부 누르게 하고 "남긴 의견이 없습니다"를 띄우면
 * 대부분의 클릭이 빈 창으로 끝나, 표식이 있고 없고가 뜻하는 바가 흐려진다.
 */
function Stamp({ line, onOpenComment }: { line: StampLine; onOpenComment?: () => void }) {
  const mark = (
    <StampMark
      label={DECISION_LABEL[line.decision]}
      tone={line.decision}
      date={line.decision === 'PENDING' ? null : line.decidedAt}
      hasComment={Boolean(line.comment)}
    />
  )
  if (!line.comment || !onOpenComment) return mark
  return (
    <button
      type="button"
      onClick={onOpenComment}
      title="결재 의견 보기"
      className={cn(
        'rounded-radius-md px-2 py-1 transition-colors',
        'hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
      )}
    >
      {mark}
    </button>
  )
}

/**
 * 내 차례의 도장 자리 — '대기'가 아니라 **누르면 찍히는 빈 자리**로 그린다.
 *
 * 형태가 다른 이유: 찍힌 도장(승인·반려·기안)과 남의 대기 칸은 모두 실선 원이라 '지금 상태'를
 * 읽는 표식이지만, 이 칸만은 상태가 아니라 **할 일**이다. 종이 결재에서 도장을 찍을 자리에
 * 점선을 그어 두는 것과 같은 문법으로, 점선 원 + 브랜드색으로 "여기가 비어 있고 네가 채운다"를
 * 말한다(공용 DashedAddButton이 빈 자리를 점선으로 그리는 것과 같은 판단).
 *
 * 글자는 '처리'로 적어 상단 [○○ 처리] 버튼과 같은 말로 맞춘다 — 두 자리가 같은 창을 열므로
 * 이름이 갈리면 다른 일로 읽힌다. 어느 구분의 처리인지는 도장 아래 한 줄이 답한다.
 */
function ActionStamp({ kindLabel, onClick }: { kindLabel: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // 누를 수 있는 자리라는 것은 색·테두리만이 아니라 **면적**으로도 말한다 — 원만 누르게
      // 두면 표 안에서 표적이 너무 작다. 칸 안쪽을 넉넉히 감싸고 hover에 면색을 깐다.
      className={cn(
        'group inline-flex flex-col items-center gap-1 rounded-radius-md px-3 py-1.5 transition-colors',
        'hover:bg-brand-25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
      )}
      title={`${kindLabel} 처리`}
    >
      <span
        className={cn(
          'flex size-10 items-center justify-center rounded-full border-2 border-dashed border-current bg-white font-bold text-brand',
          'group-hover:border-solid',
        )}
      >
        처리
      </span>
      {/* 도장이 찍힌 칸의 일시가 서던 자리 — 아직 결정이 없으니 대신 무엇을 하는 자리인지 적는다. */}
      <span className={cn(approvalText.meta, 'whitespace-nowrap text-brand')}>{kindLabel}</span>
    </button>
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
  actionableLineId,
  onAction,
  onOpenComment,
  className,
}: ApprovalStampTableProps) {
  const of = (kind: ApprovalLineKind) => lines.filter((l) => (l.kind ?? 'APPROVAL') === kind)
  const toPerson = (line: StampLine, seq?: number): GridPerson => {
    // 누를 수 있는 자리는 오직 하나 — 상세 화면이 "지금 내 차례"라고 알려준 그 행뿐이다.
    // 여기서 다시 판정하지 않는다(차례 규칙은 model이 소유하고, 서버가 다시 확인한다).
    const actionable = onAction && line.id === actionableLineId && line.decision === 'PENDING'
    return {
      key: line.id,
      title: titleOf?.(line.approverId) ?? '',
      name: nameOf(line.approverId),
      seq,
      stamp: actionable ? (
        <ActionStamp kindLabel={LINE_KIND_LABEL[line.kind ?? 'APPROVAL']} onClick={onAction} />
      ) : (
        <Stamp
          line={line}
          onOpenComment={onOpenComment ? () => onOpenComment(line.id) : undefined}
        />
      ),
    }
  }

  // 결재 행의 맨 앞은 항상 기안자 — 문서를 낸 사람이 결재선의 출발점이다. 결재자가 아니라
  // 순번은 붙이지 않고, 그 뒤의 결재자들만 순번대로 세운다.
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
  // 세 구분 모두 자기 줄 안에서 순차라 순번대로 세운다. 배지의 숫자는 저장된 step_order가
  // 아니라 **정렬 후의 자리**다 — 임시저장을 고치며 중간이 빠지면 원장 값에 구멍이 생기는데,
  // 사람이 읽는 순번에 2·4·5가 남으면 없는 3번을 찾게 된다.
  const seqOf = (kind: ApprovalLineKind) =>
    [...of(kind)].sort((a, b) => a.stepOrder - b.stepOrder).map((l, i) => toPerson(l, i + 1))
  const approval = [...drafter, ...seqOf('APPROVAL')]
  const agreement = seqOf('AGREEMENT')
  const finance = seqOf('FINANCE_AGREEMENT')

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
