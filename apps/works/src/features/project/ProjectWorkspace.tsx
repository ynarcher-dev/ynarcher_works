import { ProgramDetailPage } from '@/features/program/ProgramDetailPage'
import { ProgramWorkspacePage } from '@/features/program/ProgramWorkspacePage'
import { ProgramWorkspaceProvider, type ProgramWorkspaceConfig } from '@/features/program/workspace'

/**
 * PROJECT 워크스페이스 설정. 화면은 AC와 동일한 features/program 공용 모듈을 그대로 사용하며,
 * 원장만 project_* 테이블로 분리된다. 근거: docs/docs_planning/3_8_workspace_project.md
 * 사업구분은 글로벌/신사업/기타 3분류이며, 확장 시 아래 목록과 DB CHECK 제약을 함께 늘린다.
 */
export const PROJECT_WORKSPACE: ProgramWorkspaceConfig = {
  key: 'project',
  basePath: '/project',
  entityNoun: '프로젝트',
  tables: {
    programs: 'project_programs',
    modules: 'project_program_modules',
    moduleAssignees: 'project_program_module_assignees',
    managers: 'project_program_managers',
    departments: 'project_program_departments',
    participants: 'project_program_participants',
    timeline: 'project_program_timeline_items',
    customActivities: 'project_custom_activities',
  },
  rpcs: {
    setStaffing: 'set_project_program_staffing',
    setModule: 'set_project_program_module',
  },
  categories: [
    { value: 'GLOBAL', label: '글로벌', tone: 'info' },
    { value: 'NEW_BIZ', label: '신사업', tone: 'success' },
    { value: 'ETC', label: '기타', tone: 'neutral' },
  ],
  allowedModuleTypes: ['CUSTOM_ACTIVITY'],
}

export function ProjectWorkspacePage() {
  return (
    <ProgramWorkspaceProvider value={PROJECT_WORKSPACE}>
      <ProgramWorkspacePage />
    </ProgramWorkspaceProvider>
  )
}

export function ProjectProgramDetailPage() {
  return (
    <ProgramWorkspaceProvider value={PROJECT_WORKSPACE}>
      <ProgramDetailPage />
    </ProgramWorkspaceProvider>
  )
}
