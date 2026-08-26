import { cn } from '@ynarcher/ui'

interface ApprovalSeqBadgeProps {
  /** 자기 구분 안에서의 순번(1부터). */
  seq: number
  className?: string
}

/**
 * 결재선 순번 배지 — 결재·합의·재무합의 세 구분 모두 자기 구분 안에서 순차로 흐르므로,
 * 사람 앞에 붙는 숫자는 "몇 번째로 처리하는가"를 말한다.
 *
 * 숫자를 맨숭맨숭 적지 않고 원으로 감싸는 이유는, 그 자리에 이름·직책이 함께 서기 때문이다.
 * 벌거벗은 숫자는 이름 옆에서 글자와 같은 층에 놓여 "박민준" 앞의 "1"이 이름의 일부처럼
 * 읽힌다 — 원이 둘러지면 그것이 글이 아니라 **표식**임이 형태로 먼저 읽힌다.
 *
 * 원은 **면을 채우지 않고 헤어라인으로 두른다.** 이 화면의 원형 표식은 도장(StampMark)이
 * 먼저 정의했고, 도장은 "속을 비우고 테두리와 글자를 같은 한 가지 색으로" 찍는다 —
 * 종이 결재의 문법이다. 순번만 회색 알약처럼 면을 채우면 같은 표 안에 성격이 다른 두 종류의
 * 원이 서고, 채워진 쪽이 비워진 도장보다 무겁게 읽혀 눈금이 도장보다 앞으로 나선다.
 *
 * 크기는 고정(1.25rem)이고 숫자는 캡션 단이다. 줄의 글자를 그대로 따라가게 두면(1.5em)
 * 본문 14px 자리에서 원이 21px까지 부풀어 이름보다 덩치가 커진다 — 한 줄 안에서 크기로
 * 위계를 만들지 않는다는 원칙은 **읽는 글자**들 사이의 약속이고, 이건 글이 아니라 눈금이다.
 */
export function ApprovalSeqBadge({ seq, className }: ApprovalSeqBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-full',
        'border border-gray-300 text-caption font-medium leading-none tabular-nums text-gray-500',
        className,
      )}
    >
      {seq}
    </span>
  )
}
