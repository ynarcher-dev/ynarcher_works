import { Badge, cn } from '@ynarcher/ui'
import { useBudgetRefSource } from '@/features/approval/budgetRefContext'
import { usePartnerOption } from '@/features/management/partners/partnerDirectoryApi'

/**
 * 읽기 화면에서 '예산 줄' 값을 이름으로 편다.
 *
 * 저장된 값은 줄 id 하나이고 이름은 근거 품의가 갖는다. 이름을 지출 문서에 함께 적어 두지
 * 않은 이유는 예산 변경으로 항목명이 바뀌는 날 그 지출만 옛 이름으로 남기 때문이다.
 * 그래서 여기서 매번 근거 품의의 예산표를 보고 이름을 붙인다.
 */
export function BudgetRefText({ value }: { value: string }) {
  const { options } = useBudgetRefSource()
  if (!value) return <span className="text-gray-400">-</span>
  const found = options.find((o) => o.id === value)
  if (found) return <span>{found.path}</span>
  // 근거 품의를 읽을 수 없거나 예산 변경으로 줄이 사라진 자리. **id를 그대로 보이지 않는다** —
  // 담당자에게 `b3f9a2c1`은 아무 뜻이 없고, 무엇이 잘못됐는지도 말해 주지 못한다.
  return <span className="text-gray-500">확인할 수 없는 예산 줄</span>
}

/**
 * 읽기 화면에서 '거래처' 값을 이름으로 편다.
 * 은행·계좌는 여기서 적지 않는다 — 그 값의 주인은 거래처 원장이고, 요청서에 옮겨 적으면
 * 원장을 고쳤을 때 이 문서만 옛 계좌를 든다(거래처 하나 = 계좌 하나).
 */
export function PartnerRefText({ value }: { value: string }) {
  const { data } = usePartnerOption(value || null)
  if (!value) return <span className="text-gray-400">-</span>
  if (!data) return <span className="text-gray-500">거래처 (열람 권한 없음)</span>
  return (
    <span className={cn('inline-flex items-center gap-1.5')}>
      <span>{data.name}</span>
      <span className="tabular-nums text-gray-500">{data.code}</span>
      {/* 확인 전 딱지는 읽는 자리에서도 선다 — 결재자가 이 값을 보고 승인 여부를 정한다. */}
      {!data.verifiedAt && <Badge tone="warning">확인 전</Badge>}
    </span>
  )
}
