import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { AC_WORKSPACE } from '@/features/ac/AcWorkspace'
import { MNA_WORKSPACE } from '@/features/mna/MnaWorkspace'
import { PROJECT_WORKSPACE } from '@/features/project/ProjectWorkspace'
import type { ProgramManagerRole } from '@/features/program/hooks'
import type { ProgramWorkspaceConfig, ProgramWorkspaceKey } from '@/features/program/workspace'

/**
 * 대시보드가 세는 '나의 운영' 한 건 — **어느 워크스페이스에서 어느 자리인가**, 둘뿐이다.
 *
 * 원장은 넷(AC·M&A·PROJECT 사업 + FUND 펀드)이고 컬럼도 상태값도 서로 다르지만, 이 값을
 * 읽는 곳은 「나의 워크스페이스」 타일 하나이고 타일이 하는 일은 세는 것뿐이다. 제목·기간·
 * 상태·투입률까지 실어 올리던 시절이 있었는데(2026-08-26 이전, '참여 중인 운영' 목록),
 * 그 목록이 위 타일과 같은 물음에 두 번 답하고 있어 걷어냈다. 각 원장의 상세는 타일이 보내는
 * 워크스페이스의 '내 목록'이 답한다 — 여기서 다시 조립할 이유가 없다.
 */
export interface BusinessOperation {
  workspace: OperationWorkspaceKey
  roleKey: OperationRoleKey
}

/** 사업 3종 + 펀드. 펀드는 사업 원장(features/program)이 아니므로 키를 따로 잇는다. */
export type OperationWorkspaceKey = ProgramWorkspaceKey | 'fund'

/**
 * 운영 한 건에서 나의 자리. **원장마다 자리의 종류가 다르다** — 사업은 PM/MEMBER 둘이지만
 * 펀드는 대표펀드매니저·운용인력·관리인력 셋이다(funds.manager_id와 fund_managers.role의
 * OPERATION/ADMIN).
 *
 * 펀드의 셋을 PM/MEMBER 둘로 눌러 담지 않는 이유는, 그러면 운용과 관리가 한 칸에 뭉쳐
 * "내가 이 펀드에서 무엇을 하는 사람인가"라는 물음에 답하지 못하기 때문이다. 관리인력에게
 * 'MEMBER 3'은 자기 일이 아닌 숫자다.
 */
export type OperationRoleKey = ProgramManagerRole | 'LEAD' | 'OPERATION' | 'ADMIN'

/** 자리의 표기 — 타일의 지표 칩이 읽는 표. */
export const OPERATION_ROLE_LABEL: Record<OperationRoleKey, string> = {
  PM: 'PM',
  MEMBER: 'MEMBER',
  // 펀드의 세 자리는 펀드 화면에서 부르는 말을 그대로 줄여 적는다(타일 칩이 좁다).
  LEAD: '대펀',
  OPERATION: '운용',
  ADMIN: '관리',
}

/**
 * 타일을 눌렀을 때 갈 곳 — 그 워크스페이스의 **내 목록**이다('내 프로젝트' / '내 운용펀드').
 *
 * 워크스페이스 첫 화면(전체 목록)이 아니라 내 목록으로 보내는 이유는, 타일이 방금 말한 숫자가
 * '내가 맡은 건수'이기 때문이다. 전체 목록으로 보내면 눌러서 도착한 화면의 건수가 타일의
 * 숫자와 달라, 방금 본 수가 무엇이었는지 되묻게 된다.
 *
 * 경로 조립을 화면에 맡기지 않는 것은 사업 3종만 워크스페이스 config가 베이스를 갖고 있고
 * 펀드는 갖고 있지 않기 때문이다 — 화면에서 만들면 넷 중 하나만 손으로 적힌 경로가 된다.
 */
export const OPERATION_MINE_PATH: Record<OperationWorkspaceKey, string> = {
  ac: AC_WORKSPACE.basePath,
  mna: MNA_WORKSPACE.basePath,
  project: PROJECT_WORKSPACE.basePath,
  fund: '/fund',
}

interface ManagerRow {
  program_id: string
  role: ProgramManagerRole
  start_date: string
  end_date: string
}

const SOURCES: ProgramWorkspaceConfig[] = [AC_WORKSPACE, MNA_WORKSPACE, PROJECT_WORKSPACE]

const ACTIVE_STATUSES = new Set(['PROPOSED', 'SELECTED', 'DRAFT', 'OPERATING', 'RECRUITING', 'SCREENING', 'DEMO_DAY'])

/** 아직 손이 가는 펀드 — 청산까지 마친 펀드(CLOSED)만 뺀다(사업의 종료·취소와 같은 자리). */
const ACTIVE_FUND_STATUSES = new Set(['RAISING', 'OPERATING', 'LIQUIDATING'])

/**
 * 한 사업에서 나의 자리 — 오늘에 걸친 배정을 먼저 보고, 없으면 전체 배정에서 고른다.
 * PM 배정이 하나라도 있으면 PM이다(한 사업은 타일에서 한 칸만 차지해야 한다).
 */
function currentRole(rows: ManagerRow[]): ProgramManagerRole {
  const today = new Date().toISOString().slice(0, 10)
  const current = rows.filter((row) => row.start_date <= today && row.end_date >= today)
  const candidates = current.length > 0 ? current : rows
  return candidates.some((row) => row.role === 'PM') ? 'PM' : 'MEMBER'
}

async function fetchWorkspaceOperations(config: ProgramWorkspaceConfig, userId: string) {
  const { data: managerData, error: managerError } = await supabase
    .from(config.tables.managers)
    .select('program_id, role, start_date, end_date')
    .eq('user_id', userId)
  if (managerError) throw managerError

  const assignments = (managerData ?? []) as ManagerRow[]
  const ids = [...new Set(assignments.map((row) => row.program_id))]
  if (ids.length === 0) return []

  const { data: programData, error: programError } = await supabase
    .from(config.tables.programs)
    .select('id, status')
    .in('id', ids)
  if (programError) throw programError

  const grouped = new Map<string, ManagerRow[]>()
  assignments.forEach((row) => grouped.set(row.program_id, [...(grouped.get(row.program_id) ?? []), row]))

  return ((programData ?? []) as { id: string; status: string }[])
    .filter((program) => ACTIVE_STATUSES.has(program.status))
    .map((program): BusinessOperation => ({
      workspace: config.key,
      roleKey: currentRole(grouped.get(program.id) ?? []),
    }))
}

/**
 * 펀드에서 나의 자리 — 대표 > 운용 > 관리 순으로 하나만 고른다.
 *
 * 대표는 funds.manager_id가 정본이다(set_fund_staffing은 인력 원장에 is_lead=false로만
 * 넣는다). 그래도 is_lead를 함께 보는 것은 그 규칙이 서기 전에 쌓인 행 때문이다.
 *
 * 인력 원장의 PK가 (fund_id, user_id)라 한 펀드에서 운용·관리를 겸할 수는 없지만, 대표로도
 * 지정되면서 인력 행까지 가진 경우는 있다 — 그때 세는 자리는 대표 하나다. 한 사람이 한
 * 펀드에서 두 칸에 잡히면 타일의 세 숫자를 더한 값이 운영 건수보다 커진다.
 */
function fundRole(
  isManager: boolean,
  staff: { is_lead: boolean; role: string } | undefined,
): OperationRoleKey {
  if (isManager || staff?.is_lead) return 'LEAD'
  return staff?.role === 'ADMIN' ? 'ADMIN' : 'OPERATION'
}

/**
 * 내가 맡은 펀드 — 담당 축이 **둘**이라 양쪽을 함께 본다: 대표펀드매니저(`funds.manager_id`)와
 * 운용·관리 인력(`fund_managers`). 대표만 보면 인력으로 배정된 사람의 목록에서 그 펀드가
 * 통째로 빠진다('내 운용펀드' 목록과 같은 규칙이다).
 *
 * 다만 그 목록과 달리 **생성자(created_by)는 세지 않는다.** 여기는 "내가 지금 무엇을 굴리고
 * 있는가"를 묻는 자리이고, 생성자는 레코드를 만든 사람일 뿐 어떤 권한도 책임도 뜻하지 않는다
 * — 대신 등록해 준 펀드가 남의 운영 건수에 얹히면 안 된다.
 */
async function fetchFundOperations(userId: string): Promise<BusinessOperation[]> {
  const { data: staffData, error: staffError } = await supabase
    .from('fund_managers')
    .select('fund_id, role, is_lead')
    .eq('user_id', userId)
  if (staffError) throw staffError

  const staff = (staffData ?? []) as { fund_id: string; role: string; is_lead: boolean }[]
  const staffOf = new Map(staff.map((r) => [r.fund_id, r] as const))
  const staffIds = [...staffOf.keys()]

  // 대표펀드매니저 지정만 있고 인력 원장에는 행이 없는 펀드도 있으므로 두 조건을 or로 묶는다.
  const parts = [`manager_id.eq.${userId}`]
  if (staffIds.length) parts.push(`id.in.(${staffIds.join(',')})`)
  const { data: fundData, error: fundError } = await supabase
    .from('funds')
    .select('id, status, manager_id')
    .is('deleted_at', null)
    .or(parts.join(','))
  if (fundError) throw fundError

  return ((fundData ?? []) as { id: string; status: string; manager_id: string | null }[])
    .filter((fund) => ACTIVE_FUND_STATUSES.has(fund.status))
    .map((fund) => ({
      workspace: 'fund' as const,
      roleKey: fundRole(fund.manager_id === userId, staffOf.get(fund.id)),
    }))
}

export function useMyBusinessOperations(userId: string | undefined) {
  return useQuery({
    queryKey: ['office', 'dashboard', 'business-operations', userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => (await Promise.all([
      ...SOURCES.map((config) => fetchWorkspaceOperations(config, userId!)),
      fetchFundOperations(userId!),
    ])).flat(),
  })
}
