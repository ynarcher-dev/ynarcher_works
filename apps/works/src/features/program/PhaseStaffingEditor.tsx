import { Button, Field, cardText } from '@ynarcher/ui'
import {
  ProgramDepartmentEditor,
  type ProgramDepartmentSegment,
} from '@/features/program/ProgramDepartmentEditor'
import {
  ProgramManagerEditor,
  type ProgramManagerSegment,
} from '@/features/program/ProgramManagerEditor'
import type { StaffingPhase } from '@/features/program/programManagerCoverage'
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
      {/* 단계 이름과 그 기간은 한 줄에 나란히 서므로 같은 크기로 둔다 — 구분은 굵기와 색이 맡는다. */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cardText.subhead}>{phase.label}</span>
          <span className="tabular-nums text-body text-gray-600">
            {phase.start} ~ {phase.end}
          </span>
        </div>
        {previousPhase && (
          <Button variant="outline" className="shrink-0" onClick={copyFromPrevious}>
            이전 단계 복사
          </Button>
        )}
      </div>

      {/*
        규칙 설명은 `Field`의 `hint`가 라벨 **옆**에 접어 둔다(2026-09-01).
        종전에는 규칙을 라벨과 같은 줄에 괄호로 붙였다 — `hint`가 컨트롤 아래 줄이던 시절에는
        편집기 한 덩어리를 지나 저 밑에 붙어 무엇에 대한 설명인지 이어지지 않았기 때문이다.
        지금은 `hint`가 라벨 옆에 서므로 그 이유가 사라졌고, 괄호를 걷어 라벨이 이름만 말한다.
      */}
      <div className="space-y-3">
        <Field
          as="div"
          label="부서 구성"
          hint={'메인 부서는 1개이고 협업 부서는 여러 개를 둘 수 있습니다.\n협업비율의 합은 100%가 되어야 합니다.'}
        >
          <ProgramDepartmentEditor value={deptSlice} onChange={setDeptSlice} versionId={phase.versionId} />
        </Field>
        <Field
          as="div"
          label="담당자 배치"
          hint={'부서별 투입률의 합은 그 부서의 협업비율과 같아야 합니다.\n같은 사람을 다시 추가하면 그 사람의 구간이 늘어납니다.'}
        >
          <ProgramManagerEditor
            value={mgrSlice}
            onChange={setMgrSlice}
            departments={deptSlice}
            versionId={phase.versionId}
            phaseStart={phase.start}
            phaseEnd={phase.end}
          />
        </Field>
      </div>
    </section>
  )
}
