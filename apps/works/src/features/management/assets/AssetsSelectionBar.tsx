import { Button } from '@ynarcher/ui'
import { formatAmount } from '@/features/management/assets/assetForm'
import { summarizeCosts, type CostBasis } from '@/features/management/assets/assetCost'

interface AssetsSelectionBarProps {
  /** 고른 자산들의 비용 근거. 빈 배열이면 이 줄 자체를 렌더하지 않는다. */
  items: CostBasis[]
  onDeactivate: () => void
  busy: boolean
}

/**
 * 선택 요약 줄 — 고른 자산의 건수와 비용 합계, 그리고 그 선택에 대고 할 수 있는 일(일괄 비활성화).
 *
 * 합계는 두 자를 함께 적는다. 연 환산은 주기가 다른 자산을 비교하는 자이고, 계약 총액은 계약이
 * 끝날 때까지 나갈 돈이다. 계산할 수 없는 행은 0으로 접지 않고 몇 건이 빠졌는지 밝힌다 —
 * 합계가 실제보다 작아 보이는 것을 눈치채지 못하는 편이 더 나쁘다.
 */
export function AssetsSelectionBar({ items, onDeactivate, busy }: AssetsSelectionBarProps) {
  if (!items.length) return null
  const { count, annualized, total, unknown } = summarizeCosts(items)

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-radius-md border border-brand-200 bg-brand-50 px-3 py-2">
      <span className="text-body font-semibold text-gray-900">{count}건 선택</span>
      <span className="text-body text-gray-700">
        연 환산 합계{' '}
        <b className="font-semibold tabular-nums">{formatAmount(annualized)}원</b>
      </span>
      <span className="text-body text-gray-700">
        계약 총액 합계 <b className="font-semibold tabular-nums">{formatAmount(total)}원</b>
      </span>
      {unknown > 0 && (
        <span className="text-caption text-gray-500">
          금액·기간이 비어 합계에서 빠진 자산 {unknown}건
        </span>
      )}
      <Button
        variant="outline"
        className="ml-auto text-danger hover:bg-danger-subtle hover:text-danger"
        onClick={onDeactivate}
        disabled={busy}
      >
        일괄 비활성화
      </Button>
    </div>
  )
}
