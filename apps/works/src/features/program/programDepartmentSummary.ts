import type { ProgramDepartmentKind } from '@/features/program/hooks'

/** 요약에 필요한 최소 형태(목록 임베드가 주는 만큼). */
export interface DepartmentRef {
  department_id: string
  kind: ProgramDepartmentKind
}

export interface ProgramDepartmentSummary {
  /** 대표로 적을 부서(메인). 표기는 호출부가 부서 라벨 함수로 만든다. */
  mainDepartmentId: string
  /** 메인 외 부서 수. 0이면 '+N'을 붙이지 않는다. */
  restCount: number
}

/**
 * 사업의 담당 부서 한 줄 요약 — 메인 부서 하나 + 나머지 '+N'.
 *
 * 목록 한 칸에 부서를 다 적으면 사업명보다 길어지므로, **메인 부서만 적고 나머지는 수로 접는다.**
 * 협업 부서의 이름을 고르는 규칙을 두지 않는 이유이기도 하다 — 협업비율이 같은 부서가 여럿일 때
 * 어느 것을 대표로 세울지에 답이 없다. 메인은 사업당 단계별 1개로 서버가 강제하는 값이라 흔들리지 않는다.
 *
 * 부서는 단계(org 버전)마다 다시 지정되므로 같은 부서가 여러 행으로 들어온다. 그래서 계보(lineage)
 * 단위로 접어 센다 — 그러지 않으면 조직 개편을 한 번 겪은 사업이 실제보다 부서가 많아 보인다.
 * lineageOf가 아직 조직도를 못 읽었으면 id를 그대로 돌려주며, 그때는 단계 수만큼 부풀 수 있으나
 * 조직도가 도착하는 즉시 정확해진다.
 */
export function summarizeProgramDepartments(
  departments: DepartmentRef[],
  lineageOf: (departmentId: string) => string,
): ProgramDepartmentSummary | null {
  if (departments.length === 0) return null
  // 메인이 없는 사업(부서 구성 미완)은 첫 부서를 대표로 세운다 — 빈칸으로 두는 편보다 낫다.
  const main = departments.find((d) => d.kind === 'MAIN') ?? departments[0]!
  const mainLineage = lineageOf(main.department_id)
  const rest = new Set(
    departments.map((d) => lineageOf(d.department_id)).filter((l) => l !== mainLineage),
  )
  return { mainDepartmentId: main.department_id, restCount: rest.size }
}

/**
 * 요약 + 부서 표기 → 한 칸 문자열(예: '3팀 +1').
 *
 * 접힌 수를 '외 N'이 아니라 '+N'으로 적는 것은 표 안에서 같은 뜻이 한 모양이어야 해서다 —
 * 담당자 열이 이미 '+N'으로 접고 있어 두 표기가 한 행에 나란히 서면 다른 뜻인지 되짚게 된다.
 * '외'는 조사라 부서명 끝에 붙어 이름의 일부처럼 읽히기도 한다('경영지원1실 외').
 *
 * 부서를 어떻게 적을지는 이 함수가 정하지 않는다 — 칸에 보이는 값은 말단 하나(labelOf),
 * 그 위에 올리는 툴팁은 전체 경로를 주면 같은 '+N'이 두 표기로 나온다.
 */
export function programDepartmentText(
  summary: ProgramDepartmentSummary,
  labelOf: (departmentId: string) => string,
): string {
  const label = labelOf(summary.mainDepartmentId)
  return summary.restCount > 0 ? `${label} +${summary.restCount}` : label
}
