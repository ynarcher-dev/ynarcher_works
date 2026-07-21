import { Input, Select } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import type { ProgramManagerDraft } from '@/features/program/hooks'
import type { ProgramDepartmentSegment } from '@/features/program/ProgramDepartmentEditor'
import { coverageSlices } from '@/features/program/programManagerCoverage'
import { useDepartments } from '@/features/management/orgHooks'
import { useEmployees } from '@/features/hub/hooks'

/** 편집용 구간(저장 payload인 Draft + React 리스트 키). _key는 RPC에서 무시된다. */
export interface ProgramManagerSegment extends ProgramManagerDraft {
  _key: string
}

interface Props {
  /** 담당자 투입 구간 목록(사람당 복수 구간 허용) — 이 단계 스코프. */
  value: ProgramManagerSegment[]
  onChange: (rows: ProgramManagerSegment[]) => void
  /** 이 단계 지정 부서(부서 선택지 + 부서별 커버리지 목표). */
  departments: ProgramDepartmentSegment[]
  /** 이 단계의 org 버전(부서명 조회 + 신규 구간 스탬프). */
  versionId: string
  /** 단계 기간(신규 구간 프리필 + 커버리지 envelope). */
  phaseStart: string
  phaseEnd: string
}

/**
 * 프로그램 담당자 배치 편집기(부서 계층 + 기간 세그먼트).
 * 담당자를 추가하면 조직도상 본인 부서(프로그램 지정 부서 중)로 자동 배정되고, 부서·역할·기간·투입률을 편집한다.
 * 하단에 부서별로 수행 기간을 쪼갠 투입률 합을 실시간 표시해, 각 부서가 협업비율만큼 채워졌는지 드러낸다.
 */
export function ProgramManagerEditor({
  value,
  onChange,
  departments,
  versionId,
  phaseStart,
  phaseEnd,
}: Props) {
  const { data: employees } = useEmployees()
  const { data: deptMaster } = useDepartments(false, versionId)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const list = employees ?? []
  const byId = useMemo(() => new Map(list.map((e) => [e.id, e] as const)), [list])
  const deptName = (id: string) => (deptMaster ?? []).find((d) => d.id === id)?.name ?? '부서 미지정'
  const filtered = list.filter((e) => (e.name ?? '').toLowerCase().includes(query.trim().toLowerCase()))

  /** 신규 담당자 기본 부서: 조직도상 본인 부서(프로그램 지정 부서면) 아니면 메인 부서. */
  const defaultDeptFor = (userId: string): string => {
    const orgDept = byId.get(userId)?.department_id ?? ''
    if (orgDept && departments.some((d) => d.department_id === orgDept)) return orgDept
    return departments.find((d) => d.kind === 'MAIN')?.department_id ?? departments[0]?.department_id ?? ''
  }

  const add = (userId: string) => {
    onChange([
      ...value,
      {
        _key: crypto.randomUUID(),
        user_id: userId,
        org_version_id: versionId,
        department_id: defaultDeptFor(userId),
        role: 'MEMBER',
        allocation_rate: 0,
        start_date: phaseStart,
        end_date: phaseEnd,
      },
    ])
    setQuery('')
  }
  const remove = (key: string) => onChange(value.filter((r) => r._key !== key))
  const patch = (key: string, next: Partial<ProgramManagerSegment>) =>
    onChange(value.map((r) => (r._key === key ? { ...r, ...next } : r)))

  const pmCount = value.filter((r) => r.role === 'PM').length

  return (
    <div className="space-y-2">
      {/* 담당자(구간) 추가 typeahead */}
      <div className="relative">
        {open && <div className="fixed inset-0 z-dropdown" aria-hidden onClick={() => setOpen(false)} />}
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="담당자 검색 후 추가 (같은 사람을 다시 추가하면 구간이 늘어납니다)"
          className="relative z-dropdown min-h-ctl-page w-full rounded-radius-md border border-gray-300 bg-white px-3 py-1.5 text-body text-gray-900 outline-none transition-colors duration-fast placeholder:text-gray-400 focus:border-brand"
        />
        {open && (
          <div className="absolute left-0 right-0 z-dropdown mt-1 max-h-56 overflow-auto rounded-radius-lg border border-gray-300 bg-white p-1 shadow-popover">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-caption text-gray-500">
                {list.length === 0 ? '불러오는 중…' : '검색 결과가 없습니다.'}
              </div>
            ) : (
              filtered.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => add(e.id)}
                  className="block w-full rounded-radius-md px-3 py-1.5 text-left text-body text-gray-800 transition-colors duration-fast hover:bg-gray-50"
                >
                  {e.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* 구간 행 */}
      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((row) => (
            <li key={row._key} className="rounded-radius-md border border-gray-200 bg-gray-25 p-2.5">
              <div className="flex items-end gap-2">
                <div className="w-20 shrink-0">
                  <span className="mb-0.5 block text-caption text-gray-600">담당자</span>
                  <div className="flex h-ctl-page items-center">
                    <span className="truncate text-body font-medium text-gray-900">
                      {byId.get(row.user_id)?.name ?? '알 수 없음'}
                    </span>
                  </div>
                </div>
                <label className="block min-w-0 flex-1">
                  <span className="mb-0.5 block text-caption text-gray-600">부서</span>
                  <Select
                    value={row.department_id}
                    onChange={(e) => patch(row._key, { department_id: e.target.value })}
                  >
                    <option value="">부서 선택</option>
                    {departments.map((d) => (
                      <option key={d.department_id} value={d.department_id}>
                        {deptName(d.department_id)}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block w-28 shrink-0">
                  <span className="mb-0.5 block text-caption text-gray-600">역할</span>
                  <Select
                    value={row.role}
                    onChange={(e) => patch(row._key, { role: e.target.value as ProgramManagerDraft['role'] })}
                  >
                    <option value="PM">PM</option>
                    <option value="MEMBER">MEMBER</option>
                  </Select>
                </label>
                <label className="block w-16 shrink-0">
                  <span className="mb-0.5 block text-caption text-gray-600">투입률</span>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={row.allocation_rate || ''}
                    onChange={(e) =>
                      patch(row._key, {
                        allocation_rate: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                      })
                    }
                  />
                </label>
                <label className="block w-36 shrink-0">
                  <span className="mb-0.5 block text-caption text-gray-600">시작일</span>
                  <Input
                    type="date"
                    value={row.start_date}
                    onChange={(e) => patch(row._key, { start_date: e.target.value })}
                  />
                </label>
                <label className="block w-36 shrink-0">
                  <span className="mb-0.5 block text-caption text-gray-600">종료일</span>
                  <Input
                    type="date"
                    value={row.end_date}
                    onChange={(e) => patch(row._key, { end_date: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  aria-label="구간 제거"
                  onClick={() => remove(row._key)}
                  className="flex h-ctl-page shrink-0 items-center text-gray-400 transition-colors duration-fast hover:text-brand"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 부서별 커버리지: 각 부서를 수행 기간 전 구간에서 협업비율만큼 채웠는지 */}
      {value.length > 0 && departments.length > 0 && (
        <div className="space-y-2 rounded-radius-md border border-gray-200 bg-white p-2.5 text-caption">
          <div className={pmCount < 1 ? 'font-medium text-danger' : 'text-gray-600'}>
            PM {pmCount}구간{pmCount < 1 ? ' (최소 1)' : ''}
          </div>
          {departments.map((dep) => {
            const inDept = value.filter((m) => m.department_id === dep.department_id)
            const slices = coverageSlices(inDept, phaseStart, phaseEnd, dep.collaboration_ratio)
            const allOk = slices.length > 0 && slices.every((s) => s.ok)
            return (
              <div key={dep.department_id || dep._key} className="border-t border-gray-100 pt-1.5 first:border-0 first:pt-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">
                    {dep.department_id ? deptName(dep.department_id) : '부서 미선택'}
                    {dep.kind === 'MAIN' ? ' · 메인' : ''}
                  </span>
                  <span className={allOk ? 'font-medium text-success' : 'font-medium text-danger'}>
                    목표 {dep.collaboration_ratio}%{allOk ? ' 충족' : ''}
                  </span>
                </div>
                {slices.length > 0 && (
                  <ul className="mt-0.5 space-y-0.5">
                    {slices.map((s) => (
                      <li key={s.start} className="flex items-center justify-between tabular-nums">
                        <span className="text-gray-600">
                          {s.start} ~ {s.end}
                        </span>
                        <span className={s.ok ? 'text-gray-700' : 'font-medium text-danger'}>
                          {s.total}%{s.ok ? '' : s.total < dep.collaboration_ratio ? ' (부족)' : ' (초과)'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
