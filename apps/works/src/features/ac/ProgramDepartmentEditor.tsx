import { Input, Select } from '@ynarcher/ui'
import type { ProgramDepartmentDraft } from '@/features/ac/hooks'
import { ratioSum } from '@/features/ac/programManagerCoverage'
import { useDepartments } from '@/features/management/orgHooks'

/** 편집용 부서 구성(Draft + React 리스트 키). */
export interface ProgramDepartmentSegment extends ProgramDepartmentDraft {
  _key: string
}

interface Props {
  value: ProgramDepartmentSegment[]
  onChange: (rows: ProgramDepartmentSegment[]) => void
  /** 이 단계의 org 버전(부서 선택지 스코프 + 신규 행 스탬프). */
  versionId: string
}

/**
 * 프로그램 부서 구성 편집기(메인 1개 + 협업 n개) — 한 단계(org 버전) 스코프.
 * 해당 버전 조직도에서 부서를 골라 메인/협업으로 지정하고 협업비율(합 100%)을 세팅한다.
 * 담당자 투입률은 이 부서 협업비율을 기준으로 채운다.
 */
export function ProgramDepartmentEditor({ value, onChange, versionId }: Props) {
  const { data: departments } = useDepartments(false, versionId)
  const master = departments ?? []
  const nameOf = (id: string) => master.find((d) => d.id === id)?.name ?? '부서 선택'

  const add = () => {
    const isFirst = value.length === 0
    onChange([
      ...value,
      {
        _key: crypto.randomUUID(),
        org_version_id: versionId,
        department_id: '',
        kind: isFirst ? 'MAIN' : 'COLLAB',
        collaboration_ratio: 0,
      },
    ])
  }
  const remove = (key: string) => {
    const next = value.filter((r) => r._key !== key)
    // 메인을 지웠고 행이 남으면 첫 행을 메인으로 승격(항상 메인 1개 유지 시도).
    if (next.length && !next.some((r) => r.kind === 'MAIN')) next[0] = { ...next[0]!, kind: 'MAIN' }
    onChange(next)
  }
  const patch = (key: string, next: Partial<ProgramDepartmentSegment>) =>
    onChange(value.map((r) => (r._key === key ? { ...r, ...next } : r)))
  const setMain = (key: string) =>
    onChange(value.map((r) => ({ ...r, kind: r._key === key ? 'MAIN' : 'COLLAB' })))

  const sum = ratioSum(value)
  const mainCount = value.filter((r) => r.kind === 'MAIN').length
  const usedIds = new Set(value.map((r) => r.department_id).filter(Boolean))

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((row) => (
            <li key={row._key} className="flex items-center gap-2 rounded-radius-md border border-gray-200 bg-gray-25 p-2">
              <Select
                value={row.department_id}
                onChange={(e) => patch(row._key, { department_id: e.target.value })}
                className="min-w-0 flex-1"
              >
                <option value="">부서 선택</option>
                {master
                  .filter((d) => d.id === row.department_id || !usedIds.has(d.id))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </Select>
              <button
                type="button"
                onClick={() => setMain(row._key)}
                className={`shrink-0 rounded-radius-sm border px-2 py-1 text-caption font-medium transition-colors duration-fast ${
                  row.kind === 'MAIN'
                    ? 'border-brand bg-brand text-gray-0'
                    : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                }`}
                title="메인 부서로 지정"
              >
                메인
              </button>
              <label className="flex shrink-0 items-center gap-1">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={row.collaboration_ratio || ''}
                  onChange={(e) =>
                    patch(row._key, {
                      collaboration_ratio: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                    })
                  }
                  className="w-16"
                  aria-label={`${nameOf(row.department_id)} 협업비율`}
                />
                <span className="text-caption text-gray-400">%</span>
              </label>
              <button
                type="button"
                aria-label="부서 제거"
                onClick={() => remove(row._key)}
                className="shrink-0 text-gray-400 transition-colors duration-fast hover:text-brand"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={add}
          className="rounded-radius-md border border-dashed border-gray-300 px-3 py-1.5 text-caption font-medium text-gray-500 transition-colors duration-fast hover:border-gray-400 hover:bg-gray-25 hover:text-gray-700"
        >
          + 부서 추가
        </button>
        {value.length > 0 && (
          <span className="flex items-center gap-2 text-caption">
            <span className={mainCount !== 1 ? 'font-medium text-danger' : 'text-gray-400'}>
              메인 {mainCount}개{mainCount !== 1 ? ' (1개 필요)' : ''}
            </span>
            <span className={sum === 100 ? 'font-medium text-success' : 'font-medium text-danger'}>
              협업비율 합 {sum}% / 100%
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
