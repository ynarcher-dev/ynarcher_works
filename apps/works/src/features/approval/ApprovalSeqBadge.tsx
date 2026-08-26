import { cn } from '@ynarcher/ui'
import { approvalText } from '@/features/approval/config'

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
 * 읽힌다 — 원이 둘러지면 그것이 글이 아니라 **표식**임이 형태로 먼저 읽힌다(도장 칸의 원과
 * 같은 문법이고, 결재선 표는 원래 원형 표식으로 읽는 양식이다).
 *
 * 크기는 줄의 글자 크기를 따라간다(`1.5em`) — 한 줄 안에서 크기를 갈라 위계를 만들지 않는다는
 * 원칙대로, 배지는 이름보다 크지도 작지도 않고 면색으로만 물러선다. 채우는 색을 브랜드색이
 * 아니라 회색으로 두는 것도 같은 이유다: 순번은 읽는 사람이 찾아야 할 정보가 아니라 순서를
 * 확인할 때만 보는 눈금이라, 도장(브랜드·정보색)보다 앞으로 나서면 안 된다.
 */
export function ApprovalSeqBadge({ seq, className }: ApprovalSeqBadgeProps) {
  return (
    <span
      className={cn(
        approvalText.body,
        'inline-flex size-[1.5em] shrink-0 items-center justify-center rounded-full',
        'bg-gray-100 font-semibold leading-none tabular-nums text-gray-700',
        className,
      )}
    >
      {seq}
    </span>
  )
}
