import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import { useMemo } from 'react'
import { useApprovalDocs, useBudgets, useDepartments } from '@/features/management/hooks'

const FISCAL_YEAR = 2026

interface BudgetRow {
  department_id: string | null
  name: string
  budget: number
  spent: number
}

/** 재무 관리: 예산 대비 실지출 경고(부서별). KPI는 KPI 관리에서 제공. */
export function FinancePanel() {
  const { data: budgets, isLoading: bl } = useBudgets(FISCAL_YEAR)
  const { data: depts } = useDepartments()
  const { data: docs } = useApprovalDocs()

  const deptName = useMemo(() => {
    const m: Record<string, string> = {}
    for (const d of depts ?? []) m[d.id] = d.name
    return m
  }, [depts])

  // 실지출 = 최종 승인 결재 문서의 금액 합(부서별).
  const spentByDept = useMemo(() => {
    const m: Record<string, number> = {}
    for (const d of docs ?? []) {
      if (d.status !== 'APPROVED' || d.amount == null) continue
      const key = 'all'
      m[key] = (m[key] ?? 0) + Number(d.amount)
    }
    return m
  }, [docs])

  const rows: BudgetRow[] = useMemo(
    () =>
      (budgets ?? []).map((b) => ({
        department_id: b.department_id,
        name: b.department_id ? (deptName[b.department_id] ?? '-') : '전사',
        budget: Number(b.budget_amount),
        spent: spentByDept['all'] ?? 0,
      })),
    [budgets, deptName, spentByDept],
  )

  const budgetCols: Column<BudgetRow>[] = [
    { key: 'name', header: '부서', render: (r) => r.name },
    {
      key: 'budget',
      header: '예산',
      align: 'right',
      numeric: true,
      render: (r) => r.budget.toLocaleString(),
    },
    {
      key: 'spent',
      header: '실지출',
      align: 'right',
      numeric: true,
      render: (r) => r.spent.toLocaleString(),
    },
    {
      key: 'status',
      header: '상태',
      align: 'right',
      render: (r) =>
        r.budget > 0 && r.spent > r.budget ? (
          <Badge tone="danger">예산 초과</Badge>
        ) : (
          <Badge tone="success">정상</Badge>
        ),
    },
  ]

  return (
    <section>
      <h2 className="mb-2 text-title-sm font-semibold text-gray-900">
        예산 대비 실지출 ({FISCAL_YEAR})
      </h2>
      {bl ? (
        <Spinner />
      ) : (
        <DataTable
          columns={budgetCols}
          rows={rows}
          rowKey={(r) => r.department_id ?? 'all'}
          emptyText="등록된 예산이 없습니다."
        />
      )}
    </section>
  )
}
