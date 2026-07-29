import { Badge, Button, CardShell, DataTable, EmptyState, type Column } from '@ynarcher/ui'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { FundLpRosterModal } from '@/features/fund/FundLpRosterModal'
import { FUND_LP_TYPE_LABEL, FUND_LP_TYPE_TONE } from '@/features/fund/fundListHooks'
import type { FundLp } from '@/features/fund/hooks'

const lpColumns: Column<FundLp>[] = [
  { key: 'name', header: '조합원명', primary: true, render: (r) => r.name },
  {
    key: 'lp_type',
    header: '조합원유형',
    render: (r) => (
      <Badge tone={FUND_LP_TYPE_TONE[r.lp_type] ?? 'neutral'}>
        {FUND_LP_TYPE_LABEL[r.lp_type] ?? r.lp_type}
      </Badge>
    ),
  },
  {
    key: 'commitment_amount',
    header: '약정액',
    align: 'right',
    numeric: true,
    render: (r) => r.commitment_amount.toLocaleString(),
  },
  {
    // 지분율은 약정액 ÷ 약정총액의 파생값(sync_fund_lp_ownership 트리거).
    key: 'ownership_pct',
    header: '지분율',
    align: 'right',
    numeric: true,
    render: (r) => (r.ownership_pct == null ? '-' : `${r.ownership_pct}%`),
  },
  {
    // 납입액·납입률은 캐피탈 콜에서 집계된 파생값(fund_lps.paid_amount).
    key: 'paid_amount',
    header: '납입액',
    align: 'right',
    numeric: true,
    render: (r) => r.paid_amount.toLocaleString(),
  },
  {
    key: 'paid_pct',
    header: '납입률',
    align: 'right',
    numeric: true,
    render: (r) =>
      r.commitment_amount > 0
        ? `${Math.round((r.paid_amount / r.commitment_amount) * 100)}%`
        : '-',
  },
  {
    key: 'contact',
    header: '담당자',
    render: (r) => r.contact?.manager ?? '-',
  },
]

/**
 * 출자자(LP) 탭 — 조합원 원장의 유일한 입력 표면.
 *
 * 약정액은 캐스케이드의 천장이라 여기서만 입력받는다(§2.2). 지분율은 약정액에서, 납입액은
 * 캐피탈 콜에서 파생되므로 표에서 읽기 전용으로만 보여준다. 등록·수정·삭제는 모두 명부 모달
 * 한 곳에서 하고, 표의 행을 눌러도 같은 모달이 열린다.
 *
 * 지분율 도넛은 두지 않는다 — 비율은 표의 '지분율' 열이 이미 정확한 숫자로 말하고, 조합원이
 * 한둘이면 도넛이 100%/0% 한 덩어리가 되어 아무것도 보태지 못한다(§2.2 "표만으로 충분").
 * (근거: docs_planning/3_5_workspace_fund.md §2.2)
 */
export function FundLpPanel({ fundId, lps }: { fundId: string; lps: FundLp[] }) {
  const [open, setOpen] = useState(false)

  const openLabel = lps.length > 0 ? '명부 편집' : '출자자 등록'

  return (
    <>
      <CardShell>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-body font-semibold text-gray-700">조합원 구성</h4>
            <Button density="card" onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              {openLabel}
            </Button>
          </div>

          {lps.length > 0 ? (
            /* 표는 읽기 전용 — 편집은 명부 모달 한 곳에서만 한다(행 클릭도 같은 모달을 연다). */
            <DataTable
              columns={lpColumns}
              rows={lps}
              rowKey={(r) => r.id}
              standardColumns={false}
              onRowClick={() => setOpen(true)}
            />
          ) : (
            <EmptyState
              title="등록된 출자자(LP)가 없습니다."
              description="조합원과 약정액을 먼저 등록하면 캐피탈 콜에서 차수별 요청액을 배정할 수 있습니다."
              action={<Button onClick={() => setOpen(true)}>출자자 등록</Button>}
            />
          )}
        </div>
      </CardShell>

      <FundLpRosterModal fundId={fundId} open={open} onClose={() => setOpen(false)} lps={lps} />
    </>
  )
}
