import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { AC_WORKSPACE } from '@/features/ac/AcWorkspace'
import { MNA_WORKSPACE } from '@/features/mna/MnaWorkspace'
import { PROJECT_WORKSPACE } from '@/features/project/ProjectWorkspace'
import type { ProgramManagerRole } from '@/features/program/hooks'
import type { ProgramWorkspaceConfig, ProgramWorkspaceKey } from '@/features/program/workspace'

export interface BusinessOperation {
  id: string
  workspace: ProgramWorkspaceKey
  workspaceLabel: string
  basePath: string
  title: string
  status: string
  startDate: string | null
  endDate: string | null
  role: ProgramManagerRole
  allocationRate: number
}

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
        basePath: config.basePath,
        title: program.title,
        status: program.status,
        startDate: program.start_date,
        endDate: program.end_date,
        role: assignment.role,
        allocationRate: assignment.allocationRate,
      }
    })
}

export function useMyBusinessOperations(userId: string | undefined) {
  return useQuery({
    queryKey: ['office', 'dashboard', 'business-operations', userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => (await Promise.all(
      SOURCES.map(({ config, label }) => fetchWorkspaceOperations(config, label, userId!)),
    )).flat(),
  })
}
