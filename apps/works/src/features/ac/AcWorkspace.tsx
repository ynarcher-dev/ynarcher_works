import { AC_CATEGORIES } from '@/config/programCategories'
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
    managers: 'program_managers',
    departments: 'program_departments',
    timeline: 'program_timeline_items',
  },
  rpcs: {
    setStaffing: 'set_program_staffing',
  },
  // 공고에 제안해 선정되어야 사업이 열리므로 제안 단계(시도·선정·미선정)를 운용한다.
  hasProposalStage: true,
  // 공고를 낸 주관기관/기업이 있어야 제안이 성립하므로 '주관'을 운용한다(AC 전용).
  hasHostOrganization: true,
  categories: AC_CATEGORIES,
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
