import { Badge, Button, CardShell, DataTable, EmptyState, type Column } from '@ynarcher/ui'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { DonutChart } from '@/features/fund/DonutChart'
import { FundLpFormModal } from '@/features/fund/FundLpFormModal'
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
 * 캐피탈 콜에서 파생되므로 표에서 읽기 전용으로만 보여준다. 행을 누르면 수정 모달이 열리고
 * 삭제도 거기서 처리한다(포트폴리오 탭과 같은 규칙).
 * (근거: docs_planning/3_5_workspace_fund.md §2.2)
 */
export function FundLpPanel({ fundId, lps }: { fundId: string; lps: FundLp[] }) {
  const [modal, setModal] = useState<{ open: boolean; editing: FundLp | null }>({
    open: false,
    editing: null,
  })

  const segments = lps.map((lp) => ({ label: lp.name, value: lp.commitment_amount }))

  return (
    <>
      <CardShell>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-body font-semibold text-gray-700">조합원 구성</h4>
            <Button density="card" onClick={() => setModal({ open: true, editing: null })}>
              <Plus className="size-4" />
              출자자 등록
            </Button>
          </div>

          {lps.length > 0 ? (
            <>
              <DonutChart segments={segments} />
              <DataTable
                columns={lpColumns}
                rows={lps}
                rowKey={(r) => r.id}
                standardColumns={false}
                onRowClick={(r) => setModal({ open: true, editing: r })}
              />
            </>
          ) : (
            <EmptyState
              title="등록된 출자자(LP)가 없습니다."
              description="'출자자 등록'으로 조합원과 약정액을 먼저 등록하면 캐피탈 콜에서 차수별 요청액을 배정할 수 있습니다."
            />
          )}
        </div>
      </CardShell>

      <FundLpFormModal
        fundId={fundId}
        open={modal.open}
        onClose={() => setModal({ open: false, editing: null })}
        editing={modal.editing}
      />
    </>
  )
}
