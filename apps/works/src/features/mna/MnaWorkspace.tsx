import { MNA_CATEGORIES } from '@/config/programCategories'
import { ProgramBulkPage } from '@/features/program/ProgramBulkPage'
import { ProgramDetailPage } from '@/features/program/ProgramDetailPage'
import { ProgramWorkspacePage } from '@/features/program/ProgramWorkspacePage'
import { ProgramWorkspaceProvider, type ProgramWorkspaceConfig } from '@/features/program/workspace'

/**
 * M&A/PE 워크스페이스 설정. 화면은 AC와 동일한 features/program 공용 모듈을 그대로 사용하며,
 * 사업 원장만 ma_* 테이블로 분리된다. 근거: docs/docs_planning/3_6_workspace_ma.md
 * 모듈 원장은 2026-09-03 통합되어 정형 운영 모듈까지 AC와 동일하게 운용하며, 어떤 템플릿을
 * 배치할 수 있는지는 코드가 아니라 ADMIN 카탈로그(module_templates.workspaces)가 답한다.
 */
export const MNA_WORKSPACE: ProgramWorkspaceConfig = {
  key: 'mna',
  entityKey: 'ma_program',
  basePath: '/mna',
  // 목록 안쪽 문구의 도메인 명칭. M&A 딜도 화면상으로는 '프로젝트'로 부른다.
  entityNoun: '프로젝트',
  tables: {
    programs: 'ma_programs',
    managers: 'ma_program_managers',
    departments: 'ma_program_departments',
    timeline: 'ma_program_timeline_items',
  },
  rpcs: {
    setStaffing: 'set_ma_program_staffing',
  },
  // 딜은 착수 결정이 곧 시작이라 제안 단계를 밟지 않는다 — 운영 4단계만 쓴다.
  hasProposalStage: false,
  // 딜은 우리가 스스로 여는 일이라 발주·주관하는 바깥 기관이 없다.
  hasHostOrganization: false,
  categories: MNA_CATEGORIES,
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

export function MnaBulkPage() {
  return (
    <ProgramWorkspaceProvider value={MNA_WORKSPACE}>
      <ProgramBulkPage />
    </ProgramWorkspaceProvider>
  )
}
