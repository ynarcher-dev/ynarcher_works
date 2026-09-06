
import { Button } from '@ynarcher/ui'

interface AssetsSelectionBarProps {
  /** 고른 자산 수. 0이면 이 줄 자체를 렌더하지 않는다. */
  count: number
  onDeactivate: () => void
  busy: boolean
}

/**
 * 선택 요약 줄 — 고른 건수와, 그 선택에 대고 할 수 있는 일(일괄 비활성화).
 *
 * 2026-09-06에 비용 합계(연 환산·계약 총액)를 걷었다. 자산 관리에서 구독·리스 비용을 견주는
 * 일이 실제로 없었고, 아무도 보지 않는 숫자가 선택할 때마다 줄의 절반을 차지했다.
 */
export function AssetsSelectionBar({ count, onDeactivate, busy }: AssetsSelectionBarProps) {
  if (!count) return null

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-radius-md border border-brand-200 bg-brand-50 px-3 py-2">
      <span className="text-body font-semibold text-gray-900">{count}건 선택</span>
      <div className="ml-auto">
        <Button variant="outline-danger" onClick={onDeactivate} disabled={busy}>
          일괄 비활성화
        </Button>
      </div>
    </div>
  )
}
