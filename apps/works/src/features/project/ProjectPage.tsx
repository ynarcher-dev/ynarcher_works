import { Badge, Button, Select, Spinner, PageHeader } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PRIORITY_LABELS,
  TYPE_LABELS,
  priorityTone,
  type ProjectType,
} from '@/features/project/config'
import { ProjectFormModal } from '@/features/project/ProjectFormModal'
import { useProjects } from '@/features/project/hooks'

/** PROJECT 통합 대시보드: 유형/우선순위 필터 + 프로젝트 카드 그리드. */
export function ProjectPage() {
  const { data, isLoading } = useProjects()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'ALL' | ProjectType>('ALL')

  const rows = useMemo(
    () =>
      (data ?? []).filter(
        (p) => typeFilter === 'ALL' || p.project_type === typeFilter,
      ),
    [data, typeFilter],
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="프로젝트 대시보드"
        search={
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'ALL' | ProjectType)}
          >
            <option value="ALL">전체 유형</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        }
        actions={
          <Button onClick={() => setCreating(true)}>프로젝트 개설</Button>
        }
      />

      {isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 py-10 text-center text-body text-gray-400">
          개설된 프로젝트가 없습니다.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => navigate(`/project/${p.id}`)}
              className="rounded-lg border border-gray-300 bg-white p-4 text-left hover:border-brand/40 hover:shadow-sm"
            >
              <div className="flex items-center gap-2">
                <Badge tone="info">{TYPE_LABELS[p.project_type]}</Badge>
                <Badge tone={priorityTone[p.priority]}>
                  {PRIORITY_LABELS[p.priority]}
                </Badge>
              </div>
              <p className="mt-2 text-title-sm font-semibold text-gray-900">
                {p.name}
              </p>
              <p className="text-caption text-gray-500">
                {p.start_date ?? '?'} ~ {p.end_date ?? '?'}
              </p>
              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${Math.min(p.progress_pct, 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-caption tabular-nums text-gray-400">
                  진척도 {p.progress_pct}%
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <ProjectFormModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
