import { AC_CATEGORIES } from '@/config/programCategories'
import { MODULE_TYPES } from '@/features/program/config'
import { ProgramBulkPage } from '@/features/program/ProgramBulkPage'
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
  entityKey: 'program',
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
    posts: 'program_posts',
    links: 'program_links',
    // 게스트향 메뉴별 알림. 게스트 로그인을 개방한 AC만 원장을 둔다(20260901120000).
    notices: 'program_notices',
    // 게스트 첫 화면에 나가는 사업소개. NOTICE와 같은 경계(AC만, 20260901140000).
    overviews: 'program_overviews',
    // 게스트 고정 메뉴로 나가는 사업 공지사항·QNA. 같은 경계(AC만, 20260901170000).
    announcements: 'program_announcements',
    questions: 'program_questions',
  },
  rpcs: {
    setStaffing: 'set_program_staffing',
    setModule: 'set_program_module',
  },
  // 공고에 제안해 선정되어야 사업이 열리므로 제안 단계(시도·선정·미선정)를 운용한다.
  hasProposalStage: true,
  // 공고를 낸 주관기관/기업이 있어야 제안이 성립하므로 '주관'을 운용한다(AC 전용).
  hasHostOrganization: true,
  // 게스트 포털의 조회 범위가 AC 사업 원장을 기준으로 서 있어, 로그인 개방은 AC만 연다.
  guestAccess: true,
  categories: AC_CATEGORIES,
  // AC는 기본 3종 + 정형 운영 모듈 8종을 모두 운용한다.
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

export function AcBulkPage() {
  return (
    <ProgramWorkspaceProvider value={AC_WORKSPACE}>
      <ProgramBulkPage />
    </ProgramWorkspaceProvider>
  )
}
