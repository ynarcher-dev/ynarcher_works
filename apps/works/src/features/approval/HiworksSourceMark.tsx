import { cn } from '@ynarcher/ui'

interface HiworksSourceMarkProps {
  className?: string
}

/**
 * 하이웍스에서 복원한 문서를 나타내는 작은 출처 아이콘.
 * 제목 머릿말에 툴팁과 접근성 이름을 가진 표식으로 쓴다.
 */
export function HiworksSourceMark({ className }: HiworksSourceMarkProps) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center', className)}
      title="하이웍스에서 복원한 문서"
      aria-label="하이웍스에서 복원한 문서"
    >
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5"
        viewBox="0 0 18 18"
        fill="none"
      >
        <path
          fill="#159BD7"
          d="M1.5 1.5h3v5.56A4.7 4.7 0 0 1 7.67 5.8c2.7 0 4.13 1.63 4.13 4.55v6.15h-3v-5.7c0-1.62-.68-2.4-1.98-2.4-1.43 0-2.32.97-2.32 2.77v5.33h-3v-15Z"
        />
        <rect x="13.2" y="6.1" width="3.1" height="10.4" rx="1.4" fill="#159BD7" />
        <circle cx="14.75" cy="2.85" r="2.15" fill="#F58220" />
      </svg>
    </span>
  )
}
