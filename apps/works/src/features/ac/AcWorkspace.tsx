import { MODULE_TYPES } from '@/features/program/config'
import { ProgramDetailPage } from '@/features/program/ProgramDetailPage'
import { ProgramWorkspacePage } from '@/features/program/ProgramWorkspacePage'
import { ProgramWorkspaceProvider, type ProgramWorkspaceConfig } from '@/features/program/workspace'

/**
 * AC 워크스페이스 설정. 화면 구현은 전부 features/program 공용 모듈에 있고,
 * 이 파일은 원장 테이블·RPC·사업구분 등 AC 고유값만 주입한다.
 * 사업구분 근거: docs/docs_planning/3_4_2_ac_program_overview.md
 */
export const AC_WORKSPACE: ProgramWorkspaceConfig = {
  key: 'ac',
  basePath: '/ac',
  entityNoun: '사업',
  tables: {
    programs: 'programs',
    modules: 'program_modules',
    moduleAssignees: 'program_module_assignees',
    managers: 'program_managers',
    departments: 'program_departments',
    participants: 'program_participants',
    timeline: 'program_timeline_items',
    customActivities: 'custom_activities',
  },
  rpcs: {
    setStaffing: 'set_program_staffing',
    setModule: 'set_program_module',
  },
  categories: [
    { value: 'PUBLIC', label: '공공', tone: 'info' },
    { value: 'PRIVATE', label: '민간', tone: 'neutral' },
    { value: 'REVENUE', label: '매출', tone: 'success' },
  ],
  // AC는 정형 운영 모듈 9종을 모두 운용한다.
  allowedModuleTypes: MODULE_TYPES.map((def) => def.type),
}

export function AcWorkspacePage() {
  return (
    <ProgramWorkspaceProvider value={AC_WORKSPACE}>
      <ProgramWorkspacePage />
    </ProgramWorkspaceProvider>
  )
}

export function AcProgramDetailPage() {
  return (
    <ProgramWorkspaceProvider value={AC_WORKSPACE}>
      <ProgramDetailPage />
    </ProgramWorkspaceProvider>
  )
}
