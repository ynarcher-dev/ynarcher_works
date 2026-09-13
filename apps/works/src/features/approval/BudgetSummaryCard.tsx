import { Card, InfoField, InfoGrid, cn, tableText } from '@ynarcher/ui'
import { useBudgetRevisions, type BudgetUsage } from '@/features/approval/budgetApi'
import { formatMoney, formatRate } from '@/features/approval/numeric'

interface Props {
  documentId: string
  /** 품의 금액 — 예산표 합계(문서의 대표 금액). */
  budgetTotal: number | null
  /** 줄별 사용 현황. **undefined는 0이 아니라 '모른다'**이다(읽는 중이거나 읽지 못했다). */
  usage: Map<string, BudgetUsage> | undefined
  /** 이름을 붙이는 함수(적용자 표시). */
  nameOf: (id: string | null) => string
  /** 카드 제목·설명 재지정. 변경 품의는 남의 예산을 놓고 말하므로 같은 문구를 쓸 수 없다. */
  title?: string
  help?: string
  /** '품의 금액' 칸의 이름. 변경 품의에서는 그 값이 **변경 후 예산**이다. */
  totalLabel?: string
}

function dateOnly(v: string): string {
  return v.slice(0, 10)
}

/**
 * 품의 한 건의 돈 요약 — 품의 금액 · 사용 · 결재 중 · 남음 · 이익률.
 *
 * **이익 = 품의 금액 − 승인된 지출**이고 이익률은 그 비율이다. 사업이 끝나기 전에는
 * "지금까지"의 값이며, 예산 변경이 승인되면 품의 금액이 바뀌어 이익률도 함께 바뀐다.
 *
 * 결재 중 금액을 이익에서 빼지 않는 이유는 그 돈이 **아직 나가지 않았기 때문**이다. 빼 두면
 * 반려된 지출이 이익을 계속 깎고, 그 사실을 화면이 스스로 정정할 방법이 없다. 대신 한 칸을
 * 따로 세워 "곧 빠질 수 있다"를 함께 보인다.
 */
export function BudgetSummaryCard({
  documentId,
  budgetTotal,
  usage,
  nameOf,
  title = '예산 현황',
  help = '이익은 품의 금액에서 승인이 끝난 지출을 뺀 값입니다. 결재 중인 지출은 아직 나가지 않아 이익에서 빼지 않습니다.',
  totalLabel = '품의 금액',
}: Props) {
  const { data: revisions } = useBudgetRevisions(documentId)

  // 사용 현황을 모를 때 0으로 접으면 "한 푼도 안 썼고 전액 남았다"가 되어 버린다.
  const spent = usage ? [...usage.values()].reduce((a, u) => a + u.spent, 0) : null
  const pending = usage ? [...usage.values()].reduce((a, u) => a + u.pending, 0) : null
  const profit = budgetTotal === null || spent === null ? null : budgetTotal - spent
  const over = profit !== null && profit < 0
  const available =
    budgetTotal === null || spent === null || pending === null
      ? null
      : budgetTotal - spent - pending

  return (
    <Card title={title} help={help}>
      <div className="space-y-4">
        <InfoGrid>
          <InfoField label={totalLabel} value={formatMoney(budgetTotal)} />
          <InfoField label="사용(승인)" value={formatMoney(spent)} />
          <InfoField label="결재 중" value={formatMoney(pending)} />
          {/* **막지 않고 빨갛게 적기만 한다.** 초과를 걸러 내는 일은 결재자의 반려가 한다. */}
          <InfoField
            label="남는 금액(이익)"
            value={
              <span className={cn('tabular-nums', over && 'font-semibold text-danger')}>
                {formatMoney(profit)}
                {over && ' (예산 초과)'}
              </span>
            }
          />
          {/* 남는 금액(이익)과 다르다 — 결재 중인 지출까지 뺀 **지금 더 올릴 수 있는 돈**이다.
              서버가 상신을 막는 기준도 이 값이라, 화면에 없으면 담당자가 왜 막혔는지 모른다. */}
          <InfoField
            label="사용 가능액"
            value={
              <span className={cn('tabular-nums', available !== null && available < 0 && 'text-danger')}>
                {formatMoney(available)}
              </span>
            }
          />
          <InfoField label="이익률" value={formatRate(profit, budgetTotal)} />
        </InfoGrid>

        {(revisions ?? []).length > 0 && (
          <section className="space-y-1">
            <h4 className={tableText.head}>예산 변경 이력</h4>
            <div className="relative min-w-0 max-w-full overflow-x-auto rounded-radius-md border border-gray-200">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-25">
                    <th className={cn('w-16 px-3 py-1.5 text-left', tableText.head)}>차수</th>
                    <th className={cn('w-28 px-3 py-1.5 text-left', tableText.head)}>적용일</th>
                    <th className={cn('px-3 py-1.5 text-left', tableText.head)}>변경 품의</th>
                    <th className={cn('w-24 px-3 py-1.5 text-left', tableText.head)}>적용자</th>
                    <th className={cn('w-36 px-3 py-1.5 text-right', tableText.head)}>변경 전</th>
                    <th className={cn('w-36 px-3 py-1.5 text-right', tableText.head)}>변경 후</th>
                  </tr>
                </thead>
                <tbody>
                  {(revisions ?? []).map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 last:border-b-0">
                      <td className={cn('px-3 py-1.5 tabular-nums', tableText.body)}>{r.seq}차</td>
                      <td className={cn('px-3 py-1.5 tabular-nums', tableText.body)}>
                        {dateOnly(r.appliedAt)}
                      </td>
                      <td className={cn('px-3 py-1.5', tableText.body)}>
                        {/* 신청서를 열람할 수 없으면 제목이 비어 온다 — 그때도
                            "언제 얼마가 바뀌었나"는 남는다. */}
                        {r.changeTitle ?? '열람 권한 없음'}
                        {r.changeDocNo && (
                          <span className="ml-1.5 tabular-nums text-gray-500">{r.changeDocNo}</span>
                        )}
                      </td>
                      <td className={cn('px-3 py-1.5', tableText.body)}>{nameOf(r.appliedBy)}</td>
                      <td
                        className={cn(
                          'px-3 py-1.5 text-right tabular-nums text-gray-500',
                          tableText.body,
                        )}
                      >
                        {formatMoney(r.beforeTotal)}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-1.5 text-right font-medium tabular-nums',
                          tableText.body,
                        )}
                      >
                        {formatMoney(r.afterTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </Card>
  )
}
