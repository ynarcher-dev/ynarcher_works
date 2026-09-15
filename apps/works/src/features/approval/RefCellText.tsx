import { Badge, EmptyValue, cn } from '@ynarcher/ui'
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
  if (!value) return <EmptyValue />
  const found = options.find((o) => o.id === value)
  if (found) return <span>{found.path}</span>
  // 근거 품의를 읽을 수 없거나 예산 변경으로 줄이 사라진 자리. **id를 그대로 보이지 않는다** —
  // 담당자에게 `b3f9a2c1`은 아무 뜻이 없고, 무엇이 잘못됐는지도 말해 주지 못한다.
  return <span className="text-gray-500">확인할 수 없는 예산 줄</span>
}

/**
 * 읽기 화면에서 '거래처명' 값을 이름으로 편다.
 *
 * 이름의 정본은 **문서가 든 사본**이다(2026-09-15). 원장에서 상호가 바뀌어도 이미 결재를 받은
 * 요청서는 그때의 이름으로 읽혀야 한다 — 은행·계좌·예금주가 사본인 것과 같은 이유이며,
 * 그 칸들은 각자 파생 열이 들고 이 부품은 이름만 맡는다.
 *
 * 사본 열이 없는 옛 양식·옛 문서에서는 지금까지처럼 원장이 이름을 답한다.
 *
 * **코드와 확인 딱지는 원장에 매번 묻는다.** 둘은 사본이 아니라 원장의 현재 상태다 — 특히
 * 확인 딱지는 경영지원이 증빙을 보고 떼는 것이라 나중에 바뀌는 것이 정상이고, 사본으로 굳히면
 * 확인 전에 올라간 문서가 영영 확인 전으로 남는다.
 */
export function PartnerRefText({
  value,
  snapshotName,
}: {
  value: string
  /** 그 줄이 든 이름 사본. 비어 있으면 원장이 답한다. */
  snapshotName?: string
}) {
  const { data } = usePartnerOption(value || null)
  if (!value) return <EmptyValue />
  const name = (snapshotName ?? '').trim() || data?.name || ''
  if (!name) return <span className="text-gray-500">거래처 (열람 권한 없음)</span>
  return (
    <span className={cn('inline-flex items-center gap-1.5')}>
      <span>{name}</span>
      {data && <span className="tabular-nums text-gray-500">{data.code}</span>}
      {/* 확인 전 딱지는 읽는 자리에서도 선다 — 결재자가 이 값을 보고 승인 여부를 정한다. */}
      {data && !data.verifiedAt && <Badge tone="warning">확인 전</Badge>}
    </span>
  )
}
