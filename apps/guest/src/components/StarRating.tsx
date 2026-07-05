/**
 * 별점 입력(1~5). 모바일 오터치 방지를 위해 각 별 터치 영역을 48x48px 이상 확보.
 * 근거: 3_9_workspace_guest.md §2 (터치 영역 최소 48px)
 */
export function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex" role="radiogroup" aria-label="별점">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}점`}
          disabled={disabled}
          onClick={() => onChange(n)}
          className="flex size-12 items-center justify-center text-2xl disabled:opacity-50"
        >
          <span className={n <= value ? 'text-warning' : 'text-gray-300'}>★</span>
        </button>
      ))}
    </div>
  )
}
