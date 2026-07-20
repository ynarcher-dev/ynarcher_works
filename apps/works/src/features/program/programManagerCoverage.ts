import type { ProgramDepartmentDraft, ProgramManagerDraft } from '@/features/program/hooks'
import type { OrgVersion } from '@/features/management/orgHooks'

/** 배치 단계: org 버전과 프로그램 기간을 교차한 기간(포함). */
export interface StaffingPhase {
  versionId: string
  label: string
  start: string
  end: string
}

/**
 * 프로그램 기간이 걸치는 org 버전(발행됨)들을 단계로 산출한다.
 * 각 단계 기간 = 버전 유효기간[from, to)(to=null 무기한)과 [progStart, progEnd]의 교집합.
 * 프로그램 기간이 없으면 단계를 산출하지 않는다(기간 입력 후 배치).
 */
export function computePhases(
  versions: OrgVersion[],
  progStart?: string | null,
  progEnd?: string | null,
): StaffingPhase[] {
  if (!progStart || !progEnd) return []
  const phases: StaffingPhase[] = []
  for (const v of versions) {
    const vEndIncl = v.effective_to ? addDays(v.effective_to, -1) : progEnd
    const start = v.effective_from > progStart ? v.effective_from : progStart
    const end = vEndIncl < progEnd ? vEndIncl : progEnd
    if (start <= end) phases.push({ versionId: v.id, label: v.label, start, end })
  }
  return phases.sort((a, b) => a.start.localeCompare(b.start))
}

/** ISO(YYYY-MM-DD) 날짜에 n일을 더해 ISO로 반환(UTC 기준, TZ 영향 없음). */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export interface CoverageSlice {
  /** 구간 시작(포함). */
  start: string
  /** 구간 종료(포함). */
  end: string
  /** 해당 구간 활성 담당자 투입률 합. */
  total: number
  /** 목표치(부서 협업비율, 기본 100) 충족 여부. */
  ok: boolean
}

/**
 * 담당자 구간들을 경계로 쪼갠 커버리지 슬라이스.
 * 각 슬라이스에서 활성 구간(반열림 [a,b))의 투입률 합을 계산하고, `target`(부서 협업비율, 기본 100)과 비교한다.
 * envelope는 프로그램 기간(있으면) 아니면 구간들의 min~max. (서버 일별 검증과 동일 의미)
 */
export function coverageSlices(
  segments: ProgramManagerDraft[],
  progStart?: string | null,
  progEnd?: string | null,
  target = 100,
): CoverageSlice[] {
  const segs = segments.filter((s) => s.start_date && s.end_date && s.start_date <= s.end_date)
  if (segs.length === 0) return []

  const envStart = progStart || segs.map((s) => s.start_date).reduce((m, x) => (x < m ? x : m))
  const envEndIncl = progEnd || segs.map((s) => s.end_date).reduce((m, x) => (x > m ? x : m))
  const envEndExcl = addDays(envEndIncl, 1)

  const points = new Set<string>([envStart, envEndExcl])
  for (const s of segs) {
    if (s.start_date >= envStart && s.start_date <= envEndExcl) points.add(s.start_date)
    const after = addDays(s.end_date, 1)
    if (after >= envStart && after <= envEndExcl) points.add(after)
  }
  const sorted = [...points].filter((p) => p >= envStart && p <= envEndExcl).sort()

  const slices: CoverageSlice[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!
    const b = sorted[i + 1]! // 반열림 [a, b)
    const total = segs
      .filter((s) => s.start_date <= a && addDays(s.end_date, 1) >= b)
      .reduce((t, s) => t + (s.allocation_rate || 0), 0)
    slices.push({ start: a, end: addDays(b, -1), total, ok: total === target })
  }
  return slices
}

/** 부서별 협업비율 합. */
export function ratioSum(departments: ProgramDepartmentDraft[]): number {
  return departments.reduce((s, d) => s + (d.collaboration_ratio || 0), 0)
}

/** 한 단계(org 버전) 안의 부서 구성 + 담당자 배치 검증. */
function validatePhase(
  phase: StaffingPhase,
  departments: ProgramDepartmentDraft[],
  managers: ProgramManagerDraft[],
): { ok: true } | { ok: false; message: string } {
  const prefix = `[${phase.label}] `
  if (departments.length === 0 && managers.length === 0) return { ok: true } // 미설정 단계(pending) 허용
  if (departments.length === 0) {
    return { ok: false, message: `${prefix}부서 구성을 먼저 설정하세요.` }
  }
  if (departments.filter((d) => d.kind === 'MAIN').length !== 1) {
    return { ok: false, message: `${prefix}메인 부서는 정확히 1개여야 합니다.` }
  }
  if (departments.some((d) => !d.department_id)) {
    return { ok: false, message: `${prefix}부서를 선택하세요.` }
  }
  if (new Set(departments.map((d) => d.department_id)).size !== departments.length) {
    return { ok: false, message: `${prefix}같은 부서가 중복 지정되었습니다.` }
  }
  if (departments.some((d) => d.collaboration_ratio < 1 || d.collaboration_ratio > 100)) {
    return { ok: false, message: `${prefix}협업비율은 1~100 사이여야 합니다.` }
  }
  if (ratioSum(departments) !== 100) {
    return { ok: false, message: `${prefix}부서 협업비율 합이 100%여야 합니다. (현재 ${ratioSum(departments)}%)` }
  }
  if (managers.length === 0) {
    return { ok: false, message: `${prefix}담당자를 1명 이상 배정하세요.` }
  }
  const deptIds = new Set(departments.map((d) => d.department_id))
  if (managers.some((m) => !m.department_id || !deptIds.has(m.department_id))) {
    return { ok: false, message: `${prefix}담당자의 부서는 이 단계 지정 부서 중 하나여야 합니다.` }
  }
  if (managers.some((m) => !m.start_date || !m.end_date || m.allocation_rate < 1)) {
    return { ok: false, message: `${prefix}구간별 역할·수행 기간·투입률(1~100%)을 모두 입력하세요.` }
  }
  if (managers.some((m) => m.start_date < phase.start || m.end_date > phase.end)) {
    return { ok: false, message: `${prefix}담당자 구간은 단계 기간(${phase.start} ~ ${phase.end}) 내여야 합니다.` }
  }
  // 부서별 전 구간 커버리지 = 협업비율(envelope = 단계 기간)
  for (const dep of departments) {
    const inDept = managers.filter((m) => m.department_id === dep.department_id)
    const bad = coverageSlices(inDept, phase.start, phase.end, dep.collaboration_ratio).find((s) => !s.ok)
    if (bad) {
      return {
        ok: false,
        message: `${prefix}각 부서를 전 구간에서 협업비율만큼 채워야 합니다. (${bad.start}~${bad.end} = ${bad.total}% / 목표 ${dep.collaboration_ratio}%)`,
      }
    }
  }
  return { ok: true }
}

/**
 * 프로그램 배치(부서+담당자) 저장 가능 여부 검증(서버 RPC와 동일 규칙). 단계(org 버전)별 독립 검증.
 * 부서/담당자 모두 비면 허용(미배정). 각 단계는 메인1·협업비율합100 + 부서별 협업비율 충족.
 * 아직 설정 안 된 미래 단계는 pending으로 허용한다.
 */
export function validateStaffing(
  departments: ProgramDepartmentDraft[],
  managers: ProgramManagerDraft[],
  phases: StaffingPhase[],
): { ok: true } | { ok: false; message: string } {
  if (departments.length === 0 && managers.length === 0) return { ok: true }

  const phaseIds = new Set(phases.map((p) => p.versionId))
  if ([...departments, ...managers].some((r) => !phaseIds.has(r.org_version_id))) {
    return { ok: false, message: '프로그램 기간에 해당하지 않는 단계의 배치가 있습니다. 기간을 확인하세요.' }
  }
  if (managers.length > 0 && !managers.some((m) => m.role === 'PM')) {
    return { ok: false, message: 'PM을 최소 1명(구간) 지정하세요.' }
  }
  for (const phase of phases) {
    const res = validatePhase(
      phase,
      departments.filter((d) => d.org_version_id === phase.versionId),
      managers.filter((m) => m.org_version_id === phase.versionId),
    )
    if (!res.ok) return res
  }
  return { ok: true }
}
