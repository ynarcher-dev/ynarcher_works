import { PageHeader } from '@ynarcher/ui'
import { useSearchParams } from 'react-router-dom'
import { MNA_CATEGORIES } from '@/config/programCategories'
import { GUEST_ACCOUNT_READ_LABEL } from '@/config/navigation'
import { GuestAccountPanel } from '@/features/admin/GuestAccountPanel'
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
  // 이 워크스페이스가 계정을 세우는 대상 — 매각 기업과 인수 후보사(20260908220000이 열었다).
  // 'SELLER 혹은 BUYER 혹은 둘 다'는 프로젝트마다 갈리지만(사업구분 → partyKindsOf) 그것은
  // 딜 한 건의 성격이고, 창구는 워크스페이스의 것이라 둘 다 선다.
  guestMasterTables: ['ma_sellers', 'ma_buyers'],
  basePath: '/mna',
  detailBase: '/mna/deals',
  listLabel: 'M&A 딜',
  // M&A팀의 메뉴와 목록 안쪽 문구는 실제 관리 대상인 'M&A 딜'로 부른다.
  entityNoun: 'M&A 딜',
  tables: {
    programs: 'ma_programs',
    managers: 'ma_program_managers',
    departments: 'ma_program_departments',
    timeline: 'ma_program_timeline_items',
  },
  rpcs: {
    setStaffing: 'set_ma_program_staffing',
  },
  // 딜은 착수 결정이 곧 시작이라 제안 단계를 밟지 않는다.
  hasProposalStage: false,
  // 진행하다 멈춘 딜(중단)과 착수 자체를 접은 딜(취소)을 저장값으로 구분한다.
  hasSuspendedStatus: true,
  // 딜은 우리가 스스로 여는 일이라 발주·주관하는 바깥 기관이 없다.
  hasHostOrganization: false,
  categories: MNA_CATEGORIES,
  categoryNoun: 'M&A 딜 구분',
  overviewNoun: 'M&A 딜 개요',
  // 담기는 것이 SELLER·BUYER 둘 다 회사이고, 그 회사들이 무엇에 매달렸는지는 이 워크스페이스가
  // URL·메뉴에서 이미 쓰는 낱말(딜)이 답한다.
  rosterLabel: '딜 참여사',
  // 계정 후보는 담당자가 꾸린 딜 참여사 목록에서 고른다(매물·인수후보 연결은 별개 축이라
  // 그 자체로 "누구를 들일지"의 답이 되지 않는다).
  rosterSource: { kind: 'entries' },
}

export function MnaWorkspacePage() {
  const [params] = useSearchParams()

  // 계정생성 — AC와 **같은 화면**을 세우고 좁히는 축 둘만 갈아 끼운다(2026-09-08).
  // 화면을 두 벌로 만들지 않는 이유는 같은 목록을 각자 그리면 한쪽만 고쳐 어긋나기 때문이다.
  //
  //  · `entityKey` — 참여 사업 칸이 M&A 딜만 센다.
  //  · `guestMasterTables` — 목록에 설 계정과 하위 원장 탭을 SELLER·BUYER로 정한다.
  //    AC 창구에 ma_sellers 인격이 서면 회사 이름이 가려져도 계정 이메일 도메인만으로
  //    누가 매각을 검토 중인지 드러난다(3_9_2 §6).
  //
  // 정지·해제(`canSuspend`)는 주지 않는다 — 그 축은 ADMIN이 소유한다.
  if (params.get('tab') === 'guest-accounts') {
    return (
      <div className="space-y-5">
        <PageHeader title={GUEST_ACCOUNT_READ_LABEL} />
        <GuestAccountPanel
          entityKey={MNA_WORKSPACE.entityKey}
          masterTables={MNA_WORKSPACE.guestMasterTables}
        />
      </div>
    )
  }

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
