import { MNA_CATEGORIES } from '@/config/programCategories'
import { ProgramDetailPage } from '@/features/program/ProgramDetailPage'
import { ProgramWorkspacePage } from '@/features/program/ProgramWorkspacePage'
import { ProgramWorkspaceProvider, type ProgramWorkspaceConfig } from '@/features/program/workspace'

/**
 * M&A/PE 워크스페이스 설정. 화면은 AC와 동일한 features/program 공용 모듈을 그대로 사용하며,
 * 원장만 ma_* 테이블로 분리된다. 근거: docs/docs_planning/3_6_workspace_ma.md
 * 모듈 템플릿은 기본 템플릿인 커스텀 활동만 운용한다(정형 운영 모듈은 AC 전용).
 */
export const MNA_WORKSPACE: ProgramWorkspaceConfig = {
  key: 'mna',
  basePath: '/mna',
  entityNoun: '딜',
  tables: {
    programs: 'ma_programs',
    modules: 'ma_program_modules',
    moduleAssignees: 'ma_program_module_assignees',
    managers: 'ma_program_managers',
    departments: 'ma_program_departments',
    participants: 'ma_program_participants',
    timeline: 'ma_program_timeline_items',
    customActivities: 'ma_custom_activities',
  },
  rpcs: {
    setStaffing: 'set_ma_program_staffing',
    setModule: 'set_ma_program_module',
  },
  categories: MNA_CATEGORIES,
  allowedModuleTypes: ['CUSTOM_ACTIVITY'],
}

export function MnaWorkspacePage() {
  return (
    <ProgramWorkspaceProvider value={MNA_WORKSPACE}>
      <ProgramWorkspacePage />
    </ProgramWorkspaceProvider>
  )
}

export function MnaProgramDetailPage() {
  return (
    <ProgramWorkspaceProvider value={MNA_WORKSPACE}>
      <ProgramDetailPage />
    </ProgramWorkspaceProvider>
  )
}
