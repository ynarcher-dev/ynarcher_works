/**
 * 자산 금액 계산 — 완납·월 구독·연 구독을 한 자로 재는 방법.
 *
 * 금액 열에 성격이 다른 수(완납가 250만, 월 구독료 5만 5천)가 섞이면 합계가 뜻을 잃는다.
 * 그래서 두 파생값만 둔다.
 *
 *   연 환산(annualized) — 1년을 유지하는 데 드는 돈. 서로 다른 주기를 비교하는 공통 자다.
 *   계약 총액(contract total) — 계약 기간 동안 실제로 나갈 총액. 결제 회차 × 금액이다.
 *
 * 회차는 "결제일이 몇 번 돌아오는가"로 센다. 2026-01-01 개시 → 2027-12-31 만료인 월 구독은
 * 1일마다 24번 결제하므로 24회차다. 달을 일수로 나누지 않는 이유는, 청구가 일수가 아니라
 * 결제일 단위로 일어나기 때문이다.
 *
 * 계약 기간은 취득일자~회수 예정일이다(기획 §5.2 — 리스·렌탈·구독의 계약 종료일은 회수 예정일).
 * 기간이 비어 있으면 총액은 알 수 없다(null) — 0으로 접으면 "0원 계약"과 구분되지 않는다.
 */
import { BILLING_SUFFIX, type AssetBillingCycle } from '@/features/management/config'
import { formatAmount } from '@/features/management/assets/assetForm'

/** 계산에 필요한 최소 형태. Asset과 폼 초안 양쪽에서 쓴다. */
export interface CostBasis {
  amount: number | null
  billingCycle: AssetBillingCycle
  /** 계약 개시일(취득일자). */
  acquiredOn: string | null
  /** 계약 만료일(회수 예정일). */
  returnDue: string | null
}

interface Ymd {
  y: number
  m: number
  d: number
}

function parseYmd(value: string | null): Ymd | null {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return { y, m, d }
}

/**
 * 결제 회차. 완납은 한 번이고, 구독은 개시일부터 만료일까지 결제일이 돌아오는 횟수다.
 * 기간을 모르면 null — "몇 번 낼지 모른다"와 "한 번 낸다"는 다른 사실이다.
 */
export function billingPeriods(basis: CostBasis): number | null {
  if (basis.billingCycle === 'ONE_TIME') return 1
  const start = parseYmd(basis.acquiredOn)
  const end = parseYmd(basis.returnDue)
  if (!start || !end) return null
  if (
    end.y < start.y ||
    (end.y === start.y && (end.m < start.m || (end.m === start.m && end.d < start.d)))
  ) {
    return null
  }
  // 개시일의 일자를 지났으면 그 달·그 해의 결제일이 한 번 더 돌아온 것으로 센다.
  const dayPassed = end.d >= start.d ? 1 : 0
  if (basis.billingCycle === 'MONTHLY') {
    return (end.y - start.y) * 12 + (end.m - start.m) + dayPassed
  }
  const monthPassed = end.m > start.m || (end.m === start.m && end.d >= start.d) ? 1 : 0
  return end.y - start.y + monthPassed
}

/** 1년 비용. 완납은 그 금액을 그 해에 쓴 것으로 보고 그대로 둔다(비교의 기준을 잃지 않게). */
export function annualizedAmount(basis: CostBasis): number | null {
  if (basis.amount == null) return null
  if (basis.billingCycle === 'MONTHLY') return basis.amount * 12
  return basis.amount
}

/** 계약 기간 동안의 총액. 회차를 모르면 총액도 모른다. */
export function contractTotal(basis: CostBasis): number | null {
  if (basis.amount == null) return null
  const periods = billingPeriods(basis)
  return periods == null ? null : basis.amount * periods
}

/** 금액 + 주기 표기('55,000/월', '2,500,000'). 미입력은 '—'. */
export function formatCycleAmount(amount: number | null, cycle: AssetBillingCycle): string {
  if (amount == null) return '—'
  return `${formatAmount(amount)}${BILLING_SUFFIX[cycle]}`
}

/** 회차 표기('24개월', '2년'). 완납·미상은 표기하지 않는다. */
export function formatPeriods(basis: CostBasis): string | null {
  if (basis.billingCycle === 'ONE_TIME') return null
  const periods = billingPeriods(basis)
  if (periods == null) return null
  return basis.billingCycle === 'MONTHLY' ? `${periods}개월` : `${periods}년`
}

export interface CostSummary {
  count: number
  /** 연 환산 합계. 계산할 수 없는 행(금액 미입력)은 빠진다. */
  annualized: number
  /** 계약 총액 합계. 기간을 모르는 구독은 빠진다. */
  total: number
  /** 합계에 들지 못한 행 수 — 합계가 전부인지 아닌지를 화면이 밝힐 수 있게 함께 돌려준다. */
  unknown: number
}

/**
 * 고른 자산들의 비용 합계. 알 수 없는 값을 0으로 접지 않고 빠진 건수를 함께 센다 —
 * "3건 중 1건은 금액을 모른다"를 감추면 합계가 실제보다 작아 보이는 것을 눈치챌 수 없다.
 */
export function summarizeCosts(items: CostBasis[]): CostSummary {
  let annualized = 0
  let total = 0
  let unknown = 0
  for (const item of items) {
    const a = annualizedAmount(item)
    const t = contractTotal(item)
    if (a == null || t == null) unknown += 1
    if (a != null) annualized += a
    if (t != null) total += t
  }
  return { count: items.length, annualized, total, unknown }
}
