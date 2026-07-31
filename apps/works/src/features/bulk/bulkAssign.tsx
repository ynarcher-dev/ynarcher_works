/**
 * 대용량 업로드의 '담당자 일괄 지정' — 파일이 아니라 화면에서 한 번 고르고 전 행에 적용한다.
 *
 * 담당자를 CSV 열로 받지 않는 이유는 두 가지다. 사업의 배치는 단계(조직 버전)·부서·투입률·기간의
 * 조합이라 한 칸에 담기지 않고, 사람을 이름으로 받으면 동명이인과 오타가 그대로 오류 행이 된다.
 *
 * 담당자 없이 등록하게 두면 그 레코드는 담당자 원장이 비어 워크스페이스 쓰기 권한자 전원의
 * 공동관리로 열린다(CLAUDE.md 판정 규칙). 등록 폼이 담당자를 필수로 막는 것도 같은 이유이므로,
 * 업로드도 같은 선을 지킨다 — 한쪽으로만 열려 있으면 그쪽이 규칙의 우회로가 된다.
 */
import { TokenMultiSelect } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useEmployees } from '@/features/hub/hooks'
import { FundStaffingFields, type FundStaffing } from '@/features/fund/FundStaffingFields'
import { computePhases } from '@/features/program/programManagerCoverage'
import type {
  ProgramDepartmentDraft,
  ProgramManagerDraft,
} from '@/features/program/hooks'
import type { OrgVersion } from '@/features/management/orgHooks'
import type { ProgramWorkspaceConfig } from '@/features/program/workspace'
import type { BulkAssignment } from '@/features/bulk/bulkImport'

/** 값 타입을 구현체 안에 가둔 채 화면이 쓰는 unknown 계약으로 내린다. */
function defineAssignment<T>(a: {
  title: string
  hint: string
  initial: T
  render: (value: T, onChange: (next: T) => void) => ReactNode
  blockedReason: (value: T) => string | null
  precheck?: (rows: Record<string, unknown>[], value: T) => Promise<string | null>
  apply: (ids: string[], rows: Record<string, unknown>[], value: T) => Promise<void>
}): BulkAssignment {
  return {
    title: a.title,
    hint: a.hint,
    initial: a.initial,
    render: (v, onChange) => a.render(v as T, (next) => onChange(next)),
    blockedReason: (v) => a.blockedReason(v as T),
    precheck: a.precheck ? (rows, v) => a.precheck!(rows, v as T) : undefined,
    apply: (ids, rows, v) => a.apply(ids, rows, v as T),
  }
}

// ---------------------------------------------------------------------------
// FUND — 대표펀드매니저(+운용·관리 인력)
// ---------------------------------------------------------------------------

/**
 * 펀드 배정은 등록 폼과 같은 필드를 그대로 쓴다(FundStaffingFields). 업로드라고 다른 화면을 만들면
 * 대표펀드매니저가 왜 필수인지·운용과 관리가 어떻게 다른지를 두 곳에서 각각 설명하게 된다.
 */
export const FUND_BULK_ASSIGNMENT: BulkAssignment = defineAssignment<FundStaffing>({
  title: '인력 배정 (파일 전체 공통)',
  hint: '이 파일로 등록되는 모든 펀드에 같은 인력이 배정됩니다. 펀드별로 다르면 등록 후 상세에서 바꾸세요.',
  initial: { manager: [], operators: [], admins: [] },
  render: (value, onChange) => <FundStaffingFields value={value} onChange={onChange} />,
  blockedReason: (value) =>
    value.manager[0] ? null : '대표펀드매니저를 지정해야 업로드할 수 있습니다.',
  apply: async (ids, _rows, value) => {
    for (const id of ids) {
      const { error } = await supabase.rpc('set_fund_staffing', {
        p_fund_id: id,
        p_manager_id: value.manager[0] ?? null,
        p_operators: value.operators,
        p_admins: value.admins,
      })
      if (error) throw error
    }
  },
})

// ---------------------------------------------------------------------------
// 사업(AC·M&A·PROJECT) — 담당자 1명(PM)
// ---------------------------------------------------------------------------

interface ProgramAssign {
  userId: string | null
}

interface Emp {
  id: string
  name: string
}

/** 임직원 1명 선택(등록 폼의 담당자 선택과 같은 typeahead). */
function ProgramManagerPicker({
  value,
  onChange,
}: {
  value: ProgramAssign
  onChange: (next: ProgramAssign) => void
}) {
  const { data } = useEmployees()
  const employees = (data ?? []) as Emp[]
  const selected = employees.filter((e) => e.id === value.userId)
  return (
    <div className="space-y-1">
      <TokenMultiSelect<Emp>
        selected={selected}
        onChange={(next) => onChange({ userId: next.slice(-1)[0]?.id ?? null })}
        options={employees}
        getKey={(e) => e.id}
        getLabel={(e) => e.name ?? '(이름 없음)'}
        getSearchText={(e) => e.name ?? ''}
        max={1}
        placeholder="임직원 검색 후 담당자 지정(1명)"
      />
      <p className="text-caption text-gray-600">
        담당 부서는 각 단계(조직 버전)에서 이 담당자가 배치된 부서를 그대로 씁니다. 협업비율·투입률은
        100%로 들어가며, 여러 부서가 나눠 맡는 사업은 등록 후 상세에서 조정하세요.
      </p>
    </div>
  )
}

/** 발행된 조직 버전(useOrgVersions와 같은 조건 — 화면 밖에서 쓰므로 직접 조회한다). */
async function fetchOrgVersions(): Promise<OrgVersion[]> {
  const { data, error } = await supabase
    .from('org_versions')
    .select('id, label, effective_from, effective_to, status')
    .is('deleted_at', null)
    .eq('status', 'PUBLISHED')
    .order('effective_from', { ascending: false })
  if (error) throw error
  return (data ?? []) as OrgVersion[]
}

/** 담당자의 버전별 소속 부서(version_id → department_id). */
async function fetchPlacements(userId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('dept_members')
    .select('version_id, department_id')
    .eq('user_id', userId)
    .is('deleted_at', null)
  if (error) throw error
  const map = new Map<string, string>()
  for (const r of (data ?? []) as { version_id: string; department_id: string }[]) {
    map.set(r.version_id, r.department_id)
  }
  return map
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/**
 * 한 사업의 배치를 만든다. 사업 기간이 걸치는 단계마다 담당자의 소속 부서를 메인 100%로 세우고,
 * 그 단계 전 구간을 담당자 1명(PM·투입률 100%)이 채운다 — 폼 검증(validateStaffing)이 요구하는
 * 최소 형태와 같다. 성립하지 않으면 왜 안 되는지를 문자열로 돌려준다.
 */
function buildStaffing(
  row: Record<string, unknown>,
  versions: OrgVersion[],
  placement: Map<string, string>,
  userId: string,
): { departments: ProgramDepartmentDraft[]; managers: ProgramManagerDraft[] } | string {
  const title = str(row.title) || '(이름 없음)'
  const phases = computePhases(versions, str(row.start_date), str(row.end_date))
  if (phases.length === 0) {
    return `'${title}'의 기간에 걸치는 조직 버전이 없습니다. 조직관리에서 해당 기간의 조직 버전을 발행한 뒤 올리세요.`
  }
  const departments: ProgramDepartmentDraft[] = []
  const managers: ProgramManagerDraft[] = []
  for (const phase of phases) {
    const departmentId = placement.get(phase.versionId)
    if (!departmentId) {
      return `'${title}'의 단계 [${phase.label}]에 담당자의 소속 부서가 없습니다. 조직관리에서 그 버전의 인력 배치를 먼저 지정하세요.`
    }
    departments.push({
      org_version_id: phase.versionId,
      department_id: departmentId,
      kind: 'MAIN',
      collaboration_ratio: 100,
    })
    managers.push({
      user_id: userId,
      org_version_id: phase.versionId,
      department_id: departmentId,
      role: 'PM',
      allocation_rate: 100,
      start_date: phase.start,
      end_date: phase.end,
    })
  }
  return { departments, managers }
}

/**
 * 사업 3종 공용 담당자 배정. 원장별로 다른 것은 배치 저장 RPC 이름뿐이라 config에서 받는다
 * (사업 공용 모듈의 config 주입 규칙과 같은 축).
 */
export function programBulkAssignment(config: ProgramWorkspaceConfig): BulkAssignment {
  return defineAssignment<ProgramAssign>({
    title: '담당자 (파일 전체 공통)',
    hint: `이 파일로 등록되는 모든 ${config.entityNoun}의 담당자(PM)가 됩니다. 담당자가 비면 그 ${config.entityNoun}은 워크스페이스 쓰기 권한자 전원의 공동관리가 되므로 등록 폼과 같이 필수로 둡니다.`,
    initial: { userId: null },
    render: (value, onChange) => <ProgramManagerPicker value={value} onChange={onChange} />,
    blockedReason: (value) => (value.userId ? null : '담당자를 지정해야 업로드할 수 있습니다.'),
    // 등록과 배정은 RPC가 둘로 나뉘어 한 트랜잭션이 아니다. 배정이 실패할 줄 알면서 원장에 먼저
    // 넣으면 담당자 없는 사업이 남으므로, 성립 여부를 등록 전에 전부 확인한다.
    precheck: async (rows, value) => {
      if (!value.userId) return '담당자를 지정하세요.'
      const [versions, placement] = await Promise.all([
        fetchOrgVersions(),
        fetchPlacements(value.userId),
      ])
      for (const row of rows) {
        const built = buildStaffing(row, versions, placement, value.userId)
        if (typeof built === 'string') return built
      }
      return null
    },
    apply: async (ids, rows, value) => {
      if (!value.userId) return
      const [versions, placement] = await Promise.all([
        fetchOrgVersions(),
        fetchPlacements(value.userId),
      ])
      for (const [i, id] of ids.entries()) {
        const built = buildStaffing(rows[i] ?? {}, versions, placement, value.userId)
        if (typeof built === 'string') throw new Error(built)
        const { error } = await supabase.rpc(config.rpcs.setStaffing, {
          p_program_id: id,
          p_departments: built.departments,
          p_managers: built.managers,
        })
        if (error) throw error
      }
    },
  })
}
