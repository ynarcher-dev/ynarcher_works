import { Spinner } from '@ynarcher/ui'
import { useMemo } from 'react'
import { useDepartments } from '@/features/management/hooks'

/** 부서 관리: 조직도 트리(최상위 부서 → 하위 부서). */
export function DepartmentsPanel() {
  const { data: depts, isLoading } = useDepartments()

  // 조직도 트리: 최상위(부모 없음) → 하위 부서.
  const tree = useMemo(() => {
    const roots = (depts ?? []).filter((d) => !d.parent_id)
    return roots.map((r) => ({
      ...r,
      children: (depts ?? []).filter((d) => d.parent_id === r.id),
    }))
  }, [depts])

  if (isLoading) return <Spinner />

  if (tree.length === 0) {
    return (
      <p className="rounded border border-dashed border-gray-300 py-6 text-center text-body text-gray-400">
        등록된 부서가 없습니다.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-3">
      {tree.map((root) => (
        <div key={root.id} className="min-w-48 rounded border border-gray-300 bg-white p-3">
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
  )
}
