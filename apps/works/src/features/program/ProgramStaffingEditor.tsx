import { Button, IconButton, cn, tableText } from '@ynarcher/ui'
import { Plus, X } from 'lucide-react'
import { useEffect } from 'react'
import { useDepartmentOptions } from '@/features/management/departmentOptions'
import { ratioSum } from '@/features/program/programManagerCoverage'
import { StaffingDepartmentCard } from '@/features/program/StaffingDepartmentCard'
import { useStaffingPlacement } from '@/features/program/staffingPlacement'
import type {
  ProgramDepartmentSegment,
  ProgramManagerSegment,
} from '@/features/program/staffingTypes'

interface Props {
  /** 이 단계(org 버전) 몫의 부서 구성. */
  departments: ProgramDepartmentSegment[]
  onDepartmentsChange: (rows: ProgramDepartmentSegment[]) => void
  /** 이 단계 몫의 담당자 구간. */
  managers: ProgramManagerSegment[]
  onManagersChange: (rows: ProgramManagerSegment[]) => void
  /** 이 단계의 org 버전(부서 선택지 스코프 + 신규 행 스탬프). */
  versionId: string
  /** 단계 기간(신규 구간 프리필 + 커버리지 envelope). */
  phaseStart: string
  /** 단계 종료(포함). `null`이면 열린 단계 — 담당자 구간이 끝을 정한다. */
  phaseEnd: string | null
}

/**
 * 한 단계(org 버전)의 수행 조직 편집기 — **부서 카드가 목록의 단위**다.
 *
 * 2026-09-06에 '부서 구성'·'담당자 배치' 두 편집기를 합쳐 만든 자리다. 갈라 두었을 때의 문제는
 * 층이 많다는 것이 아니라 **한 사실이 세 자리에 흩어져 있다**는 것이었다 — 부서의 목표 비율,
 * 그 부서를 맡은 사람, 그 사람들이 채운 합계가 각각 다른 상자에 있어서, 무엇이 무엇의 답인지
 * 화면이 답하지 못했다. 부서를 축으로 접으면 카드 한 장이 그 셋을 함께 말한다.
 *
 * 부서 선택지는 조직도 순서 + 전체 경로 라벨이다(departmentOptions) — 같은 이름의 말단이 여럿이라
 * 이름만으로는 어느 상위 소속인지 가릴 수 없다. 이미 다른 카드가 쓰는 부서는 목록에서 뺀다.
 */
export function ProgramStaffingEditor({
  departments,
  onDepartmentsChange,
  managers,
  onManagersChange,
  versionId,
  phaseStart,
  phaseEnd,
}: Props) {
  const { options: master } = useDepartmentOptions(versionId)
  const placement = useStaffingPlacement(versionId, departments)

  /**
   * 부서 구성을 나중에 바꾸면(부서 교체·제거) 이미 추가된 구간의 부서가 옛 값으로 남는다.
   * 부서는 사람에게 종속된 값이므로 매번 다시 계산해 되맞춘다 — 계산 결과가 곧 저장값이라 한 번에
   * 수렴한다. 조직도·배치가 도착하기 전에는 손대지 않는다(전원이 '지정 부서 밖'으로 보여 부서를
   * 지워 버린다).
   */
  useEffect(() => {
    if (!placement.ready || managers.length === 0 || !placement.hasScope) return
    let changed = false
    const next = managers.map((r) => {
      const dept = placement.programDeptOf(r.user_id) ?? ''
      if (dept === r.department_id) return r
      changed = true
      return { ...r, department_id: dept }
    })
    if (changed) onManagersChange(next)
  })

  const usedIds = new Set(departments.map((d) => d.department_id).filter(Boolean))
  const sum = ratioSum(departments)
  const mainCount = departments.filter((d) => d.kind === 'MAIN').length
  const hasPm = managers.some((m) => m.role === 'PM')
  // 지정 부서 밖으로 밀려난 구간(부서를 빼거나 교체하면 생긴다). 조용히 지우지 않고 드러낸다 —
  // 저장은 어차피 막히고, 무엇이 걸렸는지 모른 채 막히는 것이 가장 나쁘다.
  const orphans = managers.filter((m) => !m.department_id || !usedIds.has(m.department_id))

  const addDept = () =>
    onDepartmentsChange([
      ...departments,
      {
        _key: crypto.randomUUID(),
        org_version_id: versionId,
        department_id: '',
        // 첫 부서는 메인이다 — 어차피 메인은 정확히 1개여야 하므로 고르게 하지 않는다.
        kind: departments.length === 0 ? 'MAIN' : 'COLLAB',
        collaboration_ratio: 0,
      },
    ])

  const removeDept = (key: string) => {
    const next = departments.filter((r) => r._key !== key)
    // 메인을 지웠고 행이 남으면 첫 행을 메인으로 승격(항상 메인 1개 유지 시도).
    if (next.length && !next.some((r) => r.kind === 'MAIN')) next[0] = { ...next[0]!, kind: 'MAIN' }
    onDepartmentsChange(next)
  }

  const patchManager = (key: string, next: Partial<ProgramManagerSegment>) =>
    onManagersChange(managers.map((r) => (r._key === key ? { ...r, ...next } : r)))

  return (
    <div className="space-y-2">
      {departments.length === 0 ? (
        <p className="rounded-radius-md border border-dashed border-gray-300 bg-gray-25 px-3 py-4 text-body-sm text-gray-500">
          부서를 먼저 추가하세요. 담당자는 부서 안에서 고릅니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {departments.map((dept) => (
            <StaffingDepartmentCard
              key={dept._key}
              dept={dept}
              managers={managers.filter(
                (m) => Boolean(dept.department_id) && m.department_id === dept.department_id,
              )}
              placement={placement}
              options={master.filter((d) => d.id === dept.department_id || !usedIds.has(d.id))}
              phaseStart={phaseStart}
              phaseEnd={phaseEnd}
              onPatchDept={(next) =>
                onDepartmentsChange(
                  departments.map((r) => (r._key === dept._key ? { ...r, ...next } : r)),
                )
              }
              onSetMain={() =>
                onDepartmentsChange(
                  departments.map((r) => ({
                    ...r,
                    kind: r._key === dept._key ? 'MAIN' : 'COLLAB',
                  })),
                )
              }
              onRemoveDept={() => removeDept(dept._key)}
              onAddManager={(userId) =>
                onManagersChange([
                  ...managers,
                  {
                    _key: crypto.randomUUID(),
                    user_id: userId,
                    org_version_id: versionId,
                    department_id: dept.department_id,
                    role: 'MEMBER',
                    allocation_rate: 0,
                    start_date: phaseStart,
                    // 끝이 열린 단계에서는 비워 둔 채로 담는다. 지어낸 끝을 채워 두면
                    // 담당자가 그 값을 그대로 저장해 "언제까지인지 정한 적 없는 구간"이 된다.
                    end_date: phaseEnd ?? '',
                  },
                ])
              }
              onPatchManager={patchManager}
              onRemoveManager={(key) => onManagersChange(managers.filter((r) => r._key !== key))}
            />
          ))}
        </ul>
      )}

      {orphans.length > 0 && (
        <div className="rounded-radius-md border border-danger-border bg-danger-subtle p-2.5">
          <p className="text-body-sm font-medium text-danger">
            지정 부서 밖 담당자 {orphans.length}명
          </p>
          <p className="mt-0.5 text-body-sm text-gray-700">
            부서를 빼거나 바꾸면서 갈 곳을 잃은 구간입니다. 그 부서를 다시 넣거나 이 구간을 제거해야
            저장됩니다.
          </p>
          <ul className="mt-1.5 space-y-1">
            {orphans.map((row) => (
              <li key={row._key} className="flex items-center gap-2">
                <span className={cn('w-28 shrink-0 truncate', tableText.primary)}>
                  {placement.nameOf(row.user_id)}
                </span>
                <span className={cn('min-w-0 flex-1 truncate', tableText.body)}>
                  {row.role} · {row.allocation_rate}% · {row.start_date} ~ {row.end_date}
                </span>
                <IconButton
                  variant="ghost"
                  danger
                  className="shrink-0"
                  label="구간 제거"
                  onClick={() => onManagersChange(managers.filter((r) => r._key !== row._key))}
                  icon={<X className="size-4" aria-hidden />}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 부서 추가와 검증 요약은 목록의 발치에서 한 줄을 나눠 쓴다. 요약이 여기 서는 이유는
          이것이 카드 하나가 아니라 **목록 전체**에 대한 판정이기 때문이다 — 부서별 판정은 각
          카드가 자기 발치에서 이미 답하고 있다. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" className="border-dashed" onClick={addDept}>
          <Plus className="size-4" aria-hidden /> 부서 추가
        </Button>
        {departments.length > 0 && (
          <span className="flex items-center gap-2 text-body-sm">
            <span className={mainCount !== 1 ? 'font-medium text-danger' : 'text-gray-600'}>
              메인 {mainCount}개{mainCount !== 1 ? ' (1개 필요)' : ''}
            </span>
            <span className={sum === 100 ? 'font-medium text-success' : 'font-medium text-danger'}>
              협업비율 합 {sum}% / 100%
            </span>
            {/* 'PM 1구간'이 아니라 '지정됨/미지정'이다(2026-09-06 사용자 지적) — 구간은 저장
                단위이지 담당자가 답할 물음이 아니고, 여기서 물어야 할 것은 "PM이 있는가" 하나다. */}
            <span className={hasPm ? 'text-gray-600' : 'font-medium text-danger'}>
              PM {hasPm ? '지정됨' : '미지정 (1명 필요)'}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
