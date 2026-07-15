import {
  ProgramDepartmentEditor,
  type ProgramDepartmentSegment,
} from '@/features/ac/ProgramDepartmentEditor'
import {
  ProgramManagerEditor,
  type ProgramManagerSegment,
} from '@/features/ac/ProgramManagerEditor'
import type { StaffingPhase } from '@/features/ac/programManagerCoverage'
import { useDepartments } from '@/features/management/orgHooks'

interface Props {
  phase: StaffingPhase
  /** 전체 부서 구성(모든 단계). 내부에서 이 단계 슬라이스만 다룬다. */
  departments: ProgramDepartmentSegment[]
  onDepartmentsChange: (rows: ProgramDepartmentSegment[]) => void
  /** 전체 담당자 배치(모든 단계). */
  managers: ProgramManagerSegment[]
  onManagersChange: (rows: ProgramManagerSegment[]) => void
  /** 직전 단계('이전 단계 복사' 출발점). 없으면 복사 버튼 숨김. */
  previousPhase?: StaffingPhase
}

/**
 * 한 단계(org 버전 기간)의 배치 편집 섹션.
 * 조직개편 경계마다 독립 재편성 — 이 단계의 부서 구성 + 담당자 배치를 그 버전 기준으로 관리한다.
 * '이전 단계 복사'는 직전 단계의 부서·인력을 lineage(버전 간 동일 부서 계보)로 이 버전에 매핑해 초안으로 채운다.
 */
export function PhaseStaffingEditor({
  phase,
  departments,
  onDepartmentsChange,
  managers,
  onManagersChange,
  previousPhase,
}: Props) {
  const { data: thisMaster } = useDepartments(false, phase.versionId)
  const { data: prevMaster } = useDepartments(false, previousPhase?.versionId)

  const deptSlice = departments.filter((d) => d.org_version_id === phase.versionId)
  const mgrSlice = managers.filter((m) => m.org_version_id === phase.versionId)
  const setDeptSlice = (rows: ProgramDepartmentSegment[]) =>
    onDepartmentsChange([...departments.filter((d) => d.org_version_id !== phase.versionId), ...rows])
  const setMgrSlice = (rows: ProgramManagerSegment[]) =>
    onManagersChange([...managers.filter((m) => m.org_version_id !== phase.versionId), ...rows])

  /** 직전 단계 → 이 단계로 부서·인력 복사(lineage 매핑, 매핑 불가 항목은 제외). */
  const copyFromPrevious = () => {
    if (!previousPhase) return
    const prevLineage = new Map((prevMaster ?? []).map((d) => [d.id, d.lineage_id]))
    const thisByLineage = new Map((thisMaster ?? []).map((d) => [d.lineage_id, d.id]))
    const remap = (deptId: string): string | undefined => {
      const lin = prevLineage.get(deptId)
      return lin ? thisByLineage.get(lin) : undefined
    }
    const newDepts = departments
      .filter((d) => d.org_version_id === previousPhase.versionId)
      .flatMap((d) => {
        const nd = remap(d.department_id)
        return nd
          ? [
              {
                _key: crypto.randomUUID(),
                org_version_id: phase.versionId,
                department_id: nd,
                kind: d.kind,
                collaboration_ratio: d.collaboration_ratio,
              } as ProgramDepartmentSegment,
            ]
          : []
      })
    const newMgrs = managers
      .filter((m) => m.org_version_id === previousPhase.versionId)
      .flatMap((m) => {
        const nd = remap(m.department_id)
        return nd
          ? [
              {
                _key: crypto.randomUUID(),
                user_id: m.user_id,
                org_version_id: phase.versionId,
                department_id: nd,
                role: m.role,
                allocation_rate: m.allocation_rate,
                start_date: phase.start,
                end_date: phase.end,
              } as ProgramManagerSegment,
            ]
          : []
      })
    setDeptSlice(newDepts)
    setMgrSlice(newMgrs)
  }

  return (
    <section className="rounded-radius-md border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <span className="text-body font-semibold text-gray-900">{phase.label}</span>
          <span className="ml-2 text-caption tabular-nums text-gray-400">
            {phase.start} ~ {phase.end}
          </span>
        </div>
        {previousPhase && (
          <button
            type="button"
            onClick={copyFromPrevious}
            className="shrink-0 rounded-radius-sm border border-gray-300 px-2 py-1 text-caption font-medium text-gray-600 transition-colors duration-fast hover:bg-gray-50"
          >
            이전 단계 복사
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <span className="mb-1 block text-caption font-medium text-gray-500">
            부서 구성 (메인 1 + 협업 n, 협업비율 합 100%)
          </span>
          <ProgramDepartmentEditor value={deptSlice} onChange={setDeptSlice} versionId={phase.versionId} />
        </div>
        <div>
          <span className="mb-1 block text-caption font-medium text-gray-500">
            담당자 배치 (부서별 합 = 협업비율)
          </span>
          <ProgramManagerEditor
            value={mgrSlice}
            onChange={setMgrSlice}
            departments={deptSlice}
            versionId={phase.versionId}
            phaseStart={phase.start}
            phaseEnd={phase.end}
          />
        </div>
      </div>
    </section>
  )
}
