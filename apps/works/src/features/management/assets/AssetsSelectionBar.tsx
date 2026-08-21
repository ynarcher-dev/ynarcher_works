import { Button } from '@ynarcher/ui'
import { formatAmount } from '@/features/management/assets/assetForm'
import { summarizeCosts, type CostBasis } from '@/features/management/assets/assetCost'

interface AssetsSelectionBarProps {
  /** 고른 자산들의 비용 근거(`costBasisFromAsset`로 만든다). 비면 이 줄 자체를 렌더하지 않는다. */
  items: CostBasis[]
  /** 고른 것 중 반출 가능한 자산 수 — 승인 설정이 걸리는 대상이다. */
  portableCount: number
  onSetApproval: (requiresApproval: boolean) => void
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
export function AssetsSelectionBar({
  items,
  portableCount,
  onSetApproval,
  onDeactivate,
  busy,
}: AssetsSelectionBarProps) {
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
      {/*
        품목 단위 운용의 실제 경로다 — '차량'으로 검색해 골라 한 번에 승인 대상으로 돌린다.
        정책이 자산마다 있는 값인 이유는 품목이 원장 없는 자유입력이기 때문이며(§6),
        반출 가능한 자산에만 걸린다(반출 못 하는 물건의 승인 여부는 뜻이 없다).
      */}
      <div className="ml-auto flex items-center gap-2">
        {portableCount > 0 && (
          <>
            <span className="text-caption text-gray-600">반출 승인({portableCount}건)</span>
            <Button variant="outline" onClick={() => onSetApproval(true)} disabled={busy}>
              필요로 설정
            </Button>
            <Button variant="outline" onClick={() => onSetApproval(false)} disabled={busy}>
              해제
            </Button>
          </>
        )}
        <Button variant="outline-danger" onClick={onDeactivate} disabled={busy}>
          일괄 비활성화
        </Button>
      </div>
    </div>
  )
}
