import { Badge, Button, CardHeading, EmptyState, cardText, cn } from '@ynarcher/ui'
import {
  CHECKOUT_LABELS,
  CHECKOUT_TONES,
  abilityOf,
  elapsedLabel,
  formatDateTime,
  OVERDUE_LABEL,
  isStartDelayed,
  overdueMs,
  type CheckoutAction,
  type CheckoutViewer,
} from '@/features/office/checkouts/checkoutConfig'
import type { Checkout } from '@/features/office/checkouts/checkoutsApi'

interface RowProps {
  c: Checkout
  now: string
  viewer: CheckoutViewer
  busy: boolean
  onAction: (checkout: Checkout, action: CheckoutAction) => void
}

/**
 * 이력 한 줄에 적을 것 — 기간·상태·반출자 셋뿐이다.
 *
 * 목적·행선지·비고 같은 사정은 이 목록의 질문이 아니다. 여기서 답할 것은 "언제, 지금 어떤
 * 상태로, 누가"이고 그 뒤의 사연은 한 건을 붙잡고 따질 때 필요하다. 셋으로 줄이면 한 건이
 * 한 줄에 들어가 다섯 건을 한눈에 훑을 수 있다 — 잘려 나간 값은 마우스를 올리면 보인다.
 */
function rowTitle(c: Checkout): string {
  return [
    c.purpose && `목적: ${c.purpose}`,
    c.destination && `행선지: ${c.destination}`,
    c.note && `비고: ${c.note}`,
    c.status === 'REJECTED' && c.decisionNote && `반려 사유: ${c.decisionNote}`,
    c.returnedAt && `반납: ${formatDateTime(c.returnedAt)}`,
    c.returnNote && `반납 메모: ${c.returnNote}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * 한 건의 반출 — 한 줄.
 *
 * 상자의 생김새는 모든 건이 같다 — 테두리·배경·여백을 상태에 따라 갈지 않는다. 상태를
 * 가르는 일은 배지의 색 하나가 맡는다(`CHECKOUT_TONES`). 상자를 갈면 목록을 세로로 훑을 때
 * 어디까지가 한 건인지 눈이 매번 다시 재야 한다.
 *
 * 바탕은 흰색이다. 회색으로 깔면 중립 배지(`반납 완료`)가 같은 회색 위에 놓여 알약의 윤곽이
 * 사라진다 — 배지가 상태를 말하려면 배지와 바탕이 같은 색이어서는 안 된다.
 *
 * 왼쪽은 읽는 것(기간 → 상태 → 반출자), 오른쪽 끝은 하는 것(처리)이다. 처리를 아래로
 * 내리면 권한이 있는 건만 상자가 높아져, 목록이 상태가 아니라 보는 사람에 따라 들쭉날쭉해진다.
 */
function CheckoutRow({ c, now, viewer, busy, onAction }: RowProps) {
  const can = abilityOf(c, viewer)
  const late = overdueMs(c, now)
  // 연체·시작 지연은 상태를 대체한다 — 표의 물품 상태(OVERDUE)가 '반출 중'을 대신하는 것과
  // 같은 판단이다. 배지를 둘로 늘리면 한 줄에 알약이 두 개 서서 어느 것이 이 건의 상태인지
  // 흐려진다. 둘은 같은 건에 함께 붙지 않는다(연체는 OUT, 시작 지연은 RESERVED).
  const delayed = isStartDelayed(c, now)
  const tone = late > 0 ? 'danger' : delayed ? 'warning' : CHECKOUT_TONES[c.status]
  const label = late > 0 ? OVERDUE_LABEL : delayed ? '시작 지연' : CHECKOUT_LABELS[c.status]

  return (
    <li
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-radius-md border border-gray-200 bg-white px-3 py-2"
      title={rowTitle(c)}
    >
      <span className={cn('shrink-0 tabular-nums', cardText.value)}>
        {formatDateTime(c.checkoutAt)} ~ {formatDateTime(c.dueAt)}
      </span>
      {/*
        배지 자리를 고정 폭으로 잡는다. 상태 라벨은 두 자('취소')에서 네 자('반납 완료')까지
        길이가 갈리는데, 폭을 내용에 맡기면 그 뒤의 반출자 이름이 행마다 다른 x에서 시작해
        세로로 훑을 수 없다. 앞의 기간은 글자 수가 늘 같으므로(tabular-nums) 이 한 칸만
        고정하면 세 열이 모두 줄을 맞춘다.
      */}
      <span className="w-20 shrink-0">
        <Badge tone={tone}>{label}</Badge>
      </span>
      <span className={cn('min-w-0 truncate', cardText.label)}>
        {c.createdByName ?? '반출자'}
      </span>
      {late > 0 && (
        <span className={cn('shrink-0 font-semibold text-danger', cardText.label)}>
          {elapsedLabel(late)}
        </span>
      )}

      {(can.canApprove || can.canStart || can.canReturn || can.canCancel) && (
        <div className="ml-auto flex shrink-0 gap-1.5">
          {can.canApprove && (
            <>
              <Button variant="outline" onClick={() => onAction(c, 'APPROVE')} disabled={busy}>
                승인
              </Button>
              <Button
                variant="outline-danger"
                onClick={() => onAction(c, 'REJECT')}
                disabled={busy}
              >
                반려
              </Button>
            </>
          )}
          {can.canStart && (
            <Button variant="outline" onClick={() => onAction(c, 'START')} disabled={busy}>
              반출
            </Button>
          )}
          {can.canReturn && (
            <Button variant="outline" onClick={() => onAction(c, 'RETURN')} disabled={busy}>
              반납
            </Button>
          )}
          {/*
            취소는 자기 요청을 거두는 일이라 outline으로 둔다. 반려와 나란히 설 수 있는데
            (승인권자가 본인 요청을 볼 때) 붉은 테두리가 둘이면 어느 쪽이 남의 요청을
            돌려보내는 버튼인지 갈리지 않는다.
          */}
          {can.canCancel && (
            <Button variant="outline" onClick={() => onAction(c, 'CANCEL')} disabled={busy}>
              취소
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

interface CheckoutHistoryListProps {
  /** 보여 줄 반출 건(지금 걸린 건이 앞, 지난 기록이 뒤). */
  lines: Checkout[]
  /** 한 번에 보여 주는 최대 건수. 목록이 이 수에 닿으면 그 사실을 적는다. */
  limit: number
  now: string
  viewer: CheckoutViewer
  busy: boolean
  onAction: (checkout: Checkout, action: CheckoutAction) => void
}

/**
 * 반출 이력 — 물품 모달의 세 번째 단락. 지금 걸린 건과 지난 기록을 같은 규격의 상자로 잇는다.
 *
 * 제목 옆 건수는 카드 제목의 `[3]` 말머리와 같은 표기를 쓰고, 목록이 상한에 닿으면 그
 * 사실을 적는다 — 몇 건만 보여 주고 아무 말도 하지 않으면 이 목록이 전부인 것으로 읽힌다.
 */
export function CheckoutHistoryList({
  lines,
  limit,
  now,
  viewer,
  busy,
  onAction,
}: CheckoutHistoryListProps) {
  return (
    <div>
      <CardHeading
        level="subhead"
        count={lines.length}
        className="mb-1.5"
        trailing={
          lines.length >= limit && (
            <span className={cn('shrink-0', cardText.label)}>최근 {limit}건까지 표시</span>
          )
        }
      >
        반출 이력
      </CardHeading>

      {lines.length === 0 ? (
        <EmptyState
          title="반출 기록이 없습니다."
          description="아직 아무도 이 물건을 가져가지 않았습니다."
          className="rounded-radius-md border border-dashed border-gray-300 py-8"
        />
      ) : (
        <ul className="space-y-1.5">
          {lines.map((c) => (
            <CheckoutRow
              key={c.id}
              c={c}
              now={now}
              viewer={viewer}
              busy={busy}
              onAction={onAction}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
