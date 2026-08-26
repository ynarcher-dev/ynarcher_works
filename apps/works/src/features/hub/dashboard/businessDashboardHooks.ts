import { useQuery } from '@tanstack/react-query'
import type { BadgeTone } from '@ynarcher/ui'
import { supabase } from '@/lib/supabase'
import { AC_WORKSPACE } from '@/features/ac/AcWorkspace'
import { MNA_WORKSPACE } from '@/features/mna/MnaWorkspace'
import { PROJECT_WORKSPACE } from '@/features/project/ProjectWorkspace'
import { FUND_STATUS_TONE, fundStatusLabel } from '@/features/fund/fundListHooks'
import { PROGRAM_STATUS_LABEL, PROGRAM_STATUS_TONE } from '@/features/program/config'
import type { ProgramManagerRole } from '@/features/program/hooks'
import type { ProgramWorkspaceConfig, ProgramWorkspaceKey } from '@/features/program/workspace'

/**
 * 대시보드가 세는 '나의 운영' 한 건. 원장은 넷(AC·M&A·PROJECT 사업 + FUND 펀드)이고
 * 서로 컬럼도 상태값도 다르므로, **여기까지 올라온 뒤에는 같은 모양**이어야 한다.
 *
 * 그래서 상태의 **표기**(라벨·톤)까지 이 계층이 정해서 올린다. 화면에서 원장별 표를 다시
 * 고르면 같은 'OPERATING'이 사업에서는 '진행중', 펀드에서는 '운용 중'이라는 사실을 표가
 * 알아야 하고, 원장이 하나 늘 때마다 화면이 함께 늘어난다.
 */
export interface BusinessOperation {
  id: string
  workspace: OperationWorkspaceKey
  workspaceLabel: string
  /** 눌렀을 때 열 상세 경로. 원장마다 경로 모양이 달라(사업 `/ac/programs/:id` vs 펀드 `/fund/:id`) 조립을 화면에 맡기지 않는다. */
  detailPath: string
  title: string
  statusLabel: string
  statusTone: BadgeTone
  startDate: string | null
  endDate: string | null
  role: ProgramManagerRole
  /** 투입률(%). 펀드는 이 축이 없어 null이며, 표는 '-'로 적는다. */
  allocationRate: number | null
}

/** 사업 3종 + 펀드. 펀드는 사업 원장(features/program)이 아니므로 키를 따로 잇는다. */
export type OperationWorkspaceKey = ProgramWorkspaceKey | 'fund'

interface ManagerRow {
  program_id: string
  role: ProgramManagerRole
  allocation_rate: number
  start_date: string
  end_date: string
}

interface ProgramRow {
  id: string
  title: string
  status: string
  start_date: string | null
  end_date: string | null
}

const SOURCES: { config: ProgramWorkspaceConfig; label: string }[] = [
  { config: AC_WORKSPACE, label: 'AC' },
  { config: MNA_WORKSPACE, label: 'M&A·PE' },
  { config: PROJECT_WORKSPACE, label: 'PROJECT' },
]

const ACTIVE_STATUSES = new Set(['PROPOSED', 'SELECTED', 'DRAFT', 'OPERATING', 'RECRUITING', 'SCREENING', 'DEMO_DAY'])

/** 아직 손이 가는 펀드 — 청산까지 마친 펀드(CLOSED)만 뺀다(사업의 종료·취소와 같은 자리). */
const ACTIVE_FUND_STATUSES = new Set(['RAISING', 'OPERATING', 'LIQUIDATING'])

function currentAssignment(rows: ManagerRow[]) {
  const today = new Date().toISOString().slice(0, 10)
  const current = rows.filter((row) => row.start_date <= today && row.end_date >= today)
  const candidates = current.length > 0 ? current : rows
  const role: ProgramManagerRole = candidates.some((row) => row.role === 'PM') ? 'PM' : 'MEMBER'
  return {
    role,
    allocationRate: Math.max(...candidates.filter((row) => row.role === role).map((row) => row.allocation_rate), 0),
  }
}

async function fetchWorkspaceOperations(config: ProgramWorkspaceConfig, label: string, userId: string) {
  const { data: managerData, error: managerError } = await supabase
    .from(config.tables.managers)
    .select('program_id, role, allocation_rate, start_date, end_date')
    .eq('user_id', userId)
  if (managerError) throw managerError

  const assignments = (managerData ?? []) as ManagerRow[]
  const ids = [...new Set(assignments.map((row) => row.program_id))]
  if (ids.length === 0) return []

  const { data: programData, error: programError } = await supabase
    .from(config.tables.programs)
    .select('id, title, status, start_date, end_date')
    .in('id', ids)
  if (programError) throw programError

  const grouped = new Map<string, ManagerRow[]>()
  assignments.forEach((row) => grouped.set(row.program_id, [...(grouped.get(row.program_id) ?? []), row]))

  return ((programData ?? []) as ProgramRow[])
    .filter((program) => ACTIVE_STATUSES.has(program.status))
    .map((program): BusinessOperation => {
      const assignment = currentAssignment(grouped.get(program.id) ?? [])
      return {
        id: program.id,
        workspace: config.key,
        workspaceLabel: label,
        detailPath: `${config.basePath}/programs/${program.id}`,
        title: program.title,
        statusLabel: PROGRAM_STATUS_LABEL[program.status] ?? program.status,
        statusTone: PROGRAM_STATUS_TONE[program.status] ?? 'neutral',
        startDate: program.start_date,
        endDate: program.end_date,
        role: assignment.role,
        allocationRate: assignment.allocationRate,
      }
    })
}

interface FundRow {
  id: string
  name: string
  status: string
  term_start: string | null
  term_end: string | null
  manager_id: string | null
}

/**
 * 내가 맡은 펀드 — 담당 축이 **둘**이라 양쪽을 함께 본다: 대표펀드매니저(`funds.manager_id`)와
 * 운용·관리 인력(`fund_managers`). 대표만 보면 인력으로 배정된 사람의 목록에서 그 펀드가
 * 통째로 빠진다('내 운용펀드' 목록과 같은 규칙이다).
 *
 * 다만 그 목록과 달리 **생성자(created_by)는 세지 않는다.** 여기는 "내가 지금 무엇을 굴리고
 * 있는가"를 묻는 자리이고, 생성자는 레코드를 만든 사람일 뿐 어떤 권한도 책임도 뜻하지 않는다
 * — 대신 등록해 준 펀드가 남의 운영 건수에 얹히면 안 된다.
 *
 * 투입률은 넘기지 않는다(null). 펀드에는 부서별 일별 투입률 같은 축이 없어, 0%를 적으면
 * "배정은 됐는데 투입이 없다"는 사실을 말하게 된다.
 */
async function fetchFundOperations(userId: string): Promise<BusinessOperation[]> {
  const { data: staffData, error: staffError } = await supabase
    .from('fund_managers')
    .select('fund_id, is_lead')
    .eq('user_id', userId)
  if (staffError) throw staffError

  const staff = (staffData ?? []) as { fund_id: string; is_lead: boolean }[]
  const leadOf = new Set(staff.filter((r) => r.is_lead).map((r) => r.fund_id))
  const staffIds = [...new Set(staff.map((r) => r.fund_id))]

  // 대표펀드매니저 지정만 있고 인력 원장에는 행이 없는 펀드도 있으므로 두 조건을 or로 묶는다.
  const parts = [`manager_id.eq.${userId}`]
  if (staffIds.length) parts.push(`id.in.(${staffIds.join(',')})`)
  const { data: fundData, error: fundError } = await supabase
    .from('funds')
    .select('id, name, status, term_start, term_end, manager_id')
    .is('deleted_at', null)
    .or(parts.join(','))
  if (fundError) throw fundError

  return ((fundData ?? []) as FundRow[])
    .filter((fund) => ACTIVE_FUND_STATUSES.has(fund.status))
    .map((fund) => ({
      id: fund.id,
      workspace: 'fund' as const,
      workspaceLabel: 'FUND',
      detailPath: `/fund/${fund.id}`,
      title: fund.name,
      statusLabel: fundStatusLabel(fund.status),
      statusTone: FUND_STATUS_TONE[fund.status] ?? 'neutral',
      startDate: fund.term_start,
      endDate: fund.term_end,
      // 대표펀드매니저와 인력 리드가 이 펀드의 PM 자리다(사업의 PM과 같은 뜻).
      role: fund.manager_id === userId || leadOf.has(fund.id) ? 'PM' : 'MEMBER',
      allocationRate: null,
    }))
}

export function useMyBusinessOperations(userId: string | undefined) {
  return useQuery({
    queryKey: ['office', 'dashboard', 'business-operations', userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => (await Promise.all([
      ...SOURCES.map(({ config, label }) => fetchWorkspaceOperations(config, label, userId!)),
      fetchFundOperations(userId!),
    ])).flat(),
  })
}
