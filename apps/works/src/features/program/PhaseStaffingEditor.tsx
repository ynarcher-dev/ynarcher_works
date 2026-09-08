import { Button, cardText, cn } from '@ynarcher/ui'
import { ProgramStaffingEditor } from '@/features/program/ProgramStaffingEditor'
import type {
  ProgramDepartmentSegment,
  ProgramManagerSegment,
} from '@/features/program/staffingTypes'
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
  /**
   * 이 배치가 **여러 단계 중 하나**인가. 기본은 참이다.
   *
   * 거짓이면 테두리 상자와 머리글 줄을 걷는다 — 운영 기간에 조직개편이 걸치지 않은 사업에는
   * 나눌 단계가 애초에 없어서, 그때 서는 상자는 '이 안이 하나의 단계'라는 사실을 말하지만 그
   * 사실이 없다. 그러면 남는 것은 층뿐이다(수행 조직 라벨 → 상자 → 부서 카드 3중). 기간과 조직
   * 버전 이름도 함께 걷는다 — 기간은 바로 위 칸에서 방금 입력한 운영 기간과 언제나 같은 값이라
   * 적어 두면 다를 수 있다고 오해하게 만들고, 버전 이름 한 줄만 남으면 바깥 라벨과 부서 카드
   * 사이에서 바깥 묶음이 아무 내용 없는 층처럼 보인다. 그 버전이 무엇인지는 부서 선택지 자체가
   * 답한다.
   */
  phased?: boolean
}

/**
 * 한 단계(org 버전 기간)의 수행 조직 편집 섹션.
 *
 * 조직개편 경계마다 독립 재편성 — 이 단계의 부서와 담당자를 그 버전 기준으로 관리한다.
 * '이전 단계 복사'는 직전 단계의 부서·인력을 lineage(버전 간 동일 부서 계보)로 이 버전에 매핑해
 * 초안으로 채운다.
 */
export function PhaseStaffingEditor({
  phase,
  departments,
  onDepartmentsChange,
  managers,
  onManagersChange,
  previousPhase,
  phased = true,
}: Props) {
  const { data: thisMaster } = useDepartments(false, phase.versionId)
  const { data: prevMaster } = useDepartments(false, previousPhase?.versionId)

  const deptSlice = departments.filter((d) => d.org_version_id === phase.versionId)
  const mgrSlice = managers.filter((m) => m.org_version_id === phase.versionId)
  const setDeptSlice = (rows: ProgramDepartmentSegment[]) =>
    onDepartmentsChange([
      ...departments.filter((d) => d.org_version_id !== phase.versionId),
      ...rows,
    ])
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
                // 열린 단계에서는 복사할 끝이 없다 — 언제까지 맡는지는 사람이 적는다.
                end_date: phase.end ?? '',
              } as ProgramManagerSegment,
            ]
          : []
      })
    setDeptSlice(newDepts)
    setMgrSlice(newMgrs)
  }

  return (
    <section className={cn(phased && 'rounded-radius-md border border-gray-200 p-3')}>
      {/* 단계 이름과 그 기간은 한 줄에 나란히 서므로 같은 크기로 둔다 — 구분은 굵기와 색이 맡는다.
          단계가 하나면 이 줄 자체가 서지 않는다(`phased` 주석 참조). */}
      {phased && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cardText.subhead}>{phase.label}</span>
            <span className="tabular-nums text-body text-gray-600">
              {/* 열린 단계는 끝을 비워 두지 않고 '종료일 미정'이라 적는다 — 빈 자리는 값이
                  없는 것인지 아직 못 받은 것인지 말하지 못한다. */}
              {phase.start} ~ {phase.end ?? '종료일 미정'}
            </span>
          </div>
          {previousPhase && (
            <Button variant="outline" className="shrink-0" onClick={copyFromPrevious}>
              이전 단계 복사
            </Button>
          )}
        </div>
      )}

      <ProgramStaffingEditor
        departments={deptSlice}
        onDepartmentsChange={setDeptSlice}
        managers={mgrSlice}
        onManagersChange={setMgrSlice}
        versionId={phase.versionId}
        phaseStart={phase.start}
        phaseEnd={phase.end}
      />
    </section>
  )
}
