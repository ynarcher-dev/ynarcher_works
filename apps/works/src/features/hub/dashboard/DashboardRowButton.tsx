import { cn } from '@ynarcher/ui'
import type { ReactNode } from 'react'

/**
 * 대시보드 우측 열의 줄 버튼 한 칸 — 아이콘 상자 + 라벨 + 우측 값.
 *
 * 근무체크의 출근·퇴근 스탬프와 전자결재의 결재함 줄이 같은 규격을 공유한다. 두 카드가
 * 위아래로 붙어 있어, 줄 높이·아이콘 상자·호버가 조금이라도 다르면 곧바로 눈에 띈다.
 *
 * 상태는 **아이콘 색 하나로만** 말한다(`active`). 테두리·배경·라벨까지 함께 칠하면 나란히 선
 * 같은 종류의 줄이 서로 다른 무게로 보여, 위계가 다른 것처럼 읽힌다.
 */
export function DashboardRowButton({
  icon,
  label,
  trailing,
  active = false,
  disabled,
  onClick,
}: {
  icon: ReactNode
  label: string
  /** 우측 끝에 붙는 값(찍힌 시각·건수 등). 값이 없으면 비워 둔다. */
  trailing?: ReactNode
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-radius-md border border-gray-200 bg-white px-3 py-2 text-left transition-colors duration-fast',
        'hover:border-gray-300 hover:bg-gray-25',
        'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:hover:border-gray-200 disabled:hover:bg-gray-50',
      )}
    >
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-radius-md',
          active ? 'bg-brand text-gray-0' : 'bg-gray-100 text-gray-400',
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span
        className={cn('flex-1 text-body-sm font-medium', disabled ? 'text-gray-400' : 'text-gray-700')}
      >
        {label}
      </span>
      {trailing}
    </button>
  )
}
