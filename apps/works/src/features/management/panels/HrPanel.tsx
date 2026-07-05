import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import { useMemo } from 'react'
import { maskEmail } from '@/lib/mask'
import {
  useDepartments,
  useEmployees,
  type Employee,
} from '@/features/management/hooks'

const ROLE_LABELS: Record<string, string> = {
  super_admin: '관리자',
  executive: '경영진',
  management_support: '경영지원',
  fund_manager: '투자실',
  ac_business: 'AC 사업부',
  mna_manager: 'M&A팀',
  project_manager: '프로젝트팀',
  read_only: '읽기 전용',
}

/** 인사 관리(HRM/HRD): 조직도 트리 + 임직원 인적 정보 디렉토리. */
export function HrPanel() {
  const { data: depts, isLoading: dl } = useDepartments()
  const { data: emps, isLoading: el } = useEmployees()

  const deptName = useMemo(() => {
    const m: Record<string, string> = {}
    for (const d of depts ?? []) m[d.id] = d.name
    return m
  }, [depts])

  // 조직도 트리: 최상위(부모 없음) → 하위 부서.
  const tree = useMemo(() => {
    const roots = (depts ?? []).filter((d) => !d.parent_id)
    return roots.map((r) => ({
      ...r,
      children: (depts ?? []).filter((d) => d.parent_id === r.id),
    }))
  }, [depts])

  const columns: Column<Employee>[] = [
    { key: 'name', header: '성명', render: (r) => r.name },
    {
      key: 'user_type',
      header: '역할',
      render: (r) => <Badge tone="neutral">{ROLE_LABELS[r.user_type] ?? r.user_type}</Badge>,
    },
    {
      key: 'department_id',
      header: '부서',
      render: (r) => (r.department_id ? deptName[r.department_id] ?? '-' : '-'),
    },
    {
      key: 'email',
      header: '이메일',
      render: (r) => maskEmail(r.email ?? ''),
    },
  ]

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 text-title-sm font-semibold text-gray-900">조직도</h2>
        {dl ? (
          <Spinner />
        ) : tree.length === 0 ? (
          <p className="rounded border border-dashed border-gray-200 py-6 text-center text-body text-gray-400">
            등록된 부서가 없습니다.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {tree.map((root) => (
              <div
                key={root.id}
                className="min-w-48 rounded border border-gray-200 bg-white p-3"
              >
                <p className="text-body font-semibold text-gray-900">{root.name}</p>
                <ul className="mt-1 space-y-0.5">
                  {root.children.map((c) => (
                    <li key={c.id} className="text-caption text-gray-600">
                      └ {c.name}
                    </li>
                  ))}
                  {root.children.length === 0 && (
                    <li className="text-caption text-gray-400">하위 부서 없음</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-title-sm font-semibold text-gray-900">
          임직원 디렉토리
        </h2>
        {el ? (
          <Spinner />
        ) : (
          <DataTable
            columns={columns}
            rows={emps ?? []}
            rowKey={(r) => r.id}
            emptyText="등록된 임직원이 없습니다."
          />
        )}
      </section>
    </div>
  )
}
