import { IconButton, Input, Select, cn, tableText } from '@ynarcher/ui'
import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ProgramManagerDraft } from '@/features/program/hooks'
import type { ProgramDepartmentSegment } from '@/features/program/ProgramDepartmentEditor'
import { coverageSlices } from '@/features/program/programManagerCoverage'
import { deptPathLabel, nearestScopedAncestor } from '@/features/management/departmentOptions'
import {
  activeOrgVersionId,
  useDepartments,
  useDeptMembers,
  useOrgVersions,
} from '@/features/management/orgHooks'
import { useEmployees } from '@/features/hub/hooks'

/**
 * 구간 행의 열 폭 — 머리글 한 줄과 모든 행이 **같은 값**을 나눠 쓴다.
 *
 * 값은 그 칸에 들어가는 것이 정한다(densityScale의 `columnWidth`와 같은 원리). 카드 밀도의
 * 컨트롤은 좌우 여백 12px, 셀렉트는 오른쪽 화살표 자리로 36px을 더 먹으므로, 폭은
 * "글자 + 그 여백"으로 잡아야 값이 잘리지 않는다 — 역할 셀렉트가 `w-28`보다 좁으면
 * `MEMBER`가 `MEMBEI`로 잘리던 것이 그 예다.
 */
const col = {
  person: 'w-24',
  role: 'w-28',
  rate: 'w-16',
  date: 'w-32',
  /** 제거 버튼(아이콘 28px) 자리 — 머리글에서는 빈 칸으로 자리만 지킨다. */
  action: 'w-icon-card',
} as const

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
 * 담당자의 부서는 고르는 값이 아니라 **사람에게 종속된 값**이다 — 그 단계 조직도에서 본인이 배치된
 * 부서를 사업 지정 부서로 접어 자동으로 따라오게 하고, 화면은 역할·기간·투입률만 편집한다.
 * 후보 목록도 같은 기준으로 좁힌다(지정 부서에 배치된 인력만).
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
  // 소속 판정은 이 단계의 조직 버전 기준이다. 부서 트리(상위 접기·경로 표기)와 인력 배치를 그 버전에서 읽는다.
  const { data: master } = useDepartments(false, versionId)
  const { data: members } = useDeptMembers(versionId)
  const { data: versions } = useOrgVersions()
  const isActivePhase = versions ? activeOrgVersionId(versions) === versionId : false
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const list = employees ?? []
  const byId = useMemo(() => new Map(list.map((e) => [e.id, e] as const)), [list])
  // 부서명은 최상위(법인)만 뺀 경로로 적는다 — 사업 목록·상세와 같은 표기(deptPathLabel).
  const deptName = (id: string) => deptPathLabel(master ?? [], id) || '부서 미지정'

  const placementMap = useMemo(
    () => new Map((members ?? []).map((m) => [m.user_id, m.department_id] as const)),
    [members],
  )
  /**
   * 이 단계 조직 버전에서 그 사람이 배치된 부서. 배치 원장(dept_members)이 원천이며,
   * 행이 없을 때만 users.department_id 미러로 채운다 — 미러는 활성 버전 값이라 다른 단계에는 쓸 수 없다.
   */
  const placementOf = (userId: string): string | null =>
    placementMap.get(userId) ?? (isActivePhase ? byId.get(userId)?.department_id ?? null : null)

  const scope = useMemo(
    () => new Set(departments.map((d) => d.department_id).filter(Boolean)),
    [departments],
  )
  /**
   * 그 사람이 속한 사업 지정 부서(자기 부서에서 위로 접어 올린 결과). 지정 부서 밖이면 null —
   * 후보에서 빠지고, 이미 추가된 구간이면 부서가 비어 저장 전에 드러난다.
   */
  const programDeptOf = (userId: string): string | null =>
    nearestScopedAncestor(master ?? [], placementOf(userId), scope)

  /**
   * 부서 구성을 나중에 바꾸면(부서 교체·제거) 이미 추가된 구간의 부서가 옛 값으로 남는다.
   * 부서는 사람에게 종속된 값이므로 매번 다시 계산해 되맞춘다 — 계산 결과가 곧 저장값이라 한 번에 수렴한다.
   * 조직도·배치가 도착하기 전에는 손대지 않는다(전원이 '지정 부서 밖'으로 보여 부서를 지워버린다).
   */
  const ready = master !== undefined && (members !== undefined || isActivePhase)
  useEffect(() => {
    if (!ready || value.length === 0 || scope.size === 0) return
    let changed = false
    const next = value.map((r) => {
      const dept = programDeptOf(r.user_id) ?? ''
      if (dept === r.department_id) return r
      changed = true
      return { ...r, department_id: dept }
    })
    if (changed) onChange(next)
  })

  // 후보는 이 단계 지정 부서(하위 포함)에 배치된 인력만이다 — 지정 부서 밖 사람은 배정해도
  // 서버가 되돌린다("담당자의 부서는 해당 단계에 지정된 부서 중 하나여야 합니다").
  const candidates = ready ? list.filter((e) => programDeptOf(e.id) !== null) : []
  const filtered = candidates.filter((e) =>
    (e.name ?? '').toLowerCase().includes(query.trim().toLowerCase()),
  )

  const add = (userId: string) => {
    onChange([
      ...value,
      {
        _key: crypto.randomUUID(),
        user_id: userId,
        org_version_id: versionId,
        department_id: programDeptOf(userId) ?? '',
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
        {/* 규격은 공용 Input이 갖는다 — 손으로 적어 두면 이 칸만 아래 구간 행과 다른 높이·글자로 남는다. */}
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          aria-label="담당자 검색"
          placeholder={
            scope.size === 0
              ? '먼저 위에서 부서 구성을 지정하세요'
              : '담당자 검색 후 추가'
          }
          className="relative z-dropdown"
        />
        {open && (
          <div className="absolute left-0 right-0 z-dropdown mt-1 max-h-56 overflow-auto rounded-radius-md border border-gray-300 bg-white p-1 shadow-popover">
            {filtered.length === 0 ? (
              // 왜 비었는지를 구분해 적는다 — 후보를 지정 부서로 좁혔기 때문에, 아무 안내가 없으면
              // 사람이 없는 것인지 검색이 안 맞은 것인지 알 수 없다.
              <div className="px-3 py-2 text-caption text-gray-500">
                {scope.size === 0
                  ? '부서 구성을 지정하면 그 부서의 인력이 나옵니다.'
                  : !ready || list.length === 0
                    ? '불러오는 중…'
                    : candidates.length === 0
                      ? '지정 부서에 배치된 인력이 없습니다.'
                      : '검색 결과가 없습니다.'}
              </div>
            ) : (
              // 동명이인·같은 성씨가 섞이는 목록이라 이름만으로는 누구인지 못 고른다.
              // 소속은 이름과 같은 크기로 두고 색으로만 눌러 한 줄 안에서 위계를 만든다.
              // 적는 소속은 이 단계 조직도상 본인 부서다(사업 지정 부서로 접기 전의 실제 배치).
              filtered.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => add(e.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-radius-md px-3 py-1.5 text-left text-body transition-colors duration-fast hover:bg-gray-50"
                >
                  <span className="truncate text-gray-800">{e.name}</span>
                  <span className="min-w-0 max-w-[60%] shrink-0 truncate text-gray-500">
                    {deptPathLabel(master ?? [], placementOf(e.id))}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/*
        구간 행. 열 이름은 행마다 반복하지 않고 머리글 한 줄로 접는다 — 모든 행이 같은 칸을
        갖는 표이므로, 라벨을 행마다 다시 적으면 같은 말이 구간 수만큼 늘어나고 그 라벨 높이만큼
        행이 세로로 부풀어 정작 값이 좁아진다. 머리글과 행은 `col`의 같은 폭을 나눠 쓴다.
      */}
      {value.length > 0 && (
        <div className="space-y-1.5">
          <div className={cn('flex items-center gap-2 px-2.5', tableText.head)}>
            <span className={cn(col.person, 'shrink-0')}>담당자</span>
            <span className="min-w-0 flex-1">부서</span>
            <span className={cn(col.role, 'shrink-0')}>역할</span>
            <span className={cn(col.rate, 'shrink-0')}>투입률</span>
            <span className={cn(col.date, 'shrink-0')}>시작일</span>
            <span className={cn(col.date, 'shrink-0')}>종료일</span>
            <span className={cn(col.action, 'shrink-0')} aria-hidden />
          </div>
          <ul className="space-y-1.5">
            {value.map((row) => (
              <li
                key={row._key}
                className="flex items-center gap-2 rounded-radius-md border border-gray-200 bg-gray-25 px-2.5 py-1.5"
              >
                <span className={cn(col.person, 'shrink-0 truncate text-body-sm font-medium text-gray-900')}>
                  {byId.get(row.user_id)?.name ?? '알 수 없음'}
                </span>
                {/* 부서는 고르는 값이 아니라 사람에게 딸려오는 값이라 입력이 아닌 표시다.
                    바꾸려면 사람의 소속(조직 관리)이나 사업의 부서 구성을 바꿔야 한다. */}
                {row.department_id ? (
                  <span
                    className="min-w-0 flex-1 truncate text-body-sm text-gray-800"
                    title={deptName(row.department_id)}
                  >
                    {deptName(row.department_id)}
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-danger">
                    지정 부서 밖
                  </span>
                )}
                {/* Input·Select는 스스로 w-full 래퍼를 두므로 폭은 바깥 칸이 갖는다. */}
                <div className={cn(col.role, 'shrink-0')}>
                  <Select
                    aria-label="역할"
                    value={row.role}
                    onChange={(e) => patch(row._key, { role: e.target.value as ProgramManagerDraft['role'] })}
                  >
                    <option value="PM">PM</option>
                    <option value="MEMBER">MEMBER</option>
                  </Select>
                </div>
                <div className={cn(col.rate, 'shrink-0')}>
                  <Input
                    aria-label="투입률(%)"
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
                </div>
                <div className={cn(col.date, 'shrink-0')}>
                  <Input
                    aria-label="시작일"
                    type="date"
                    value={row.start_date}
                    onChange={(e) => patch(row._key, { start_date: e.target.value })}
                  />
                </div>
                <div className={cn(col.date, 'shrink-0')}>
                  <Input
                    aria-label="종료일"
                    type="date"
                    value={row.end_date}
                    onChange={(e) => patch(row._key, { end_date: e.target.value })}
                  />
                </div>
                <IconButton
                  variant="ghost"
                  danger
                  className="shrink-0"
                  label="구간 제거"
                  onClick={() => remove(row._key)}
                  icon={<X className="size-4" aria-hidden />}
                />
              </li>
            ))}
          </ul>
        </div>
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
                    {dep.kind === 'MAIN' ? '메인' : '협업'}
                    {' · '}
                    {dep.department_id ? deptName(dep.department_id) : '부서 미선택'}
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
