import { cardText } from '@ynarcher/ui'
import { BILLING_LABELS } from '@/features/management/config'
import { formatAmount } from '@/features/management/assets/assetForm'
import {
  annualizedAmount,
  contractTotal,
  formatPeriods,
  type CostBasis,
} from '@/features/management/assets/assetCost'

/**
 * 폼 안의 금액 계산 결과 — 입력한 금액·주기·기간으로 "1년에 얼마"와 "계약 전체로 얼마"를 즉시 보인다.
 *
 * 사용자가 손으로 12를 곱하지 않게 하려는 것이 목적이다. 계산에 필요한 값이 비어 있으면
 * 0을 적지 않고 무엇이 빠졌는지를 적는다 — 0원과 미상은 다른 사실이다.
 */
export function AssetCostSummary({ basis }: { basis: CostBasis }) {
  const annual = annualizedAmount(basis)
  const total = contractTotal(basis)
  const periods = formatPeriods(basis)
  const subscription = basis.billingCycle !== 'ONE_TIME'

  return (
    <div className="rounded-radius-md border border-gray-200 bg-gray-25 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className={cardText.label}>
          {BILLING_LABELS[basis.billingCycle]} 기준
        </span>
        <span className="text-body text-gray-600">
          연 환산{' '}
          <b className="font-semibold tabular-nums text-gray-900">
            {annual == null ? '—' : `${formatAmount(annual)}원`}
          </b>
        </span>
        <span className="text-body text-gray-600">
          계약 총액{' '}
          <b className="font-semibold tabular-nums text-gray-900">
            {total == null ? '—' : `${formatAmount(total)}원`}
          </b>
          {periods && <span className="ml-1 text-caption text-gray-500">({periods})</span>}
        </span>
      </div>
      {/* 무엇이 없어서 계산이 멈췄는지 그 자리에서 말한다. 안내가 필요할 때만 한 줄을 쓴다. */}
      {basis.amount == null ? (
        <p className="mt-1 text-caption text-gray-500">금액을 입력하면 계산합니다.</p>
      ) : subscription && total == null ? (
        <p className="mt-1 text-caption text-gray-500">
          취득일자와 만료일을 넣으면 계약 총액까지 계산합니다.
        </p>
      ) : null}
    </div>
  )
}
