import { PageHeader } from '@ynarcher/ui'
import { useSearchParams } from 'react-router-dom'
import { AC_CATEGORIES } from '@/config/programCategories'
import { GuestAccountPanel } from '@/features/admin/GuestAccountPanel'
import { ProgramBulkPage } from '@/features/program/ProgramBulkPage'
import { ProgramDetailPage } from '@/features/program/ProgramDetailPage'
import { ProgramWorkspacePage } from '@/features/program/ProgramWorkspacePage'
import { ProgramWorkspaceProvider, type ProgramWorkspaceConfig } from '@/features/program/workspace'

/**
 * AC 워크스페이스 설정. 화면 구현은 전부 features/program 공용 모듈에 있고,
 * 이 파일은 원장 테이블·RPC·사업구분 등 AC 고유값만 주입한다.
 * 사업구분 근거: docs/docs_planning/3_4_2_ac_program_overview.md
 */
export const PROJECT_WORKSPACE: ProgramWorkspaceConfig = {
  key: 'project',
  entityKey: 'program',
  // 이 창구가 발급하는 대상 — 참여 기업(STARTUP 원장)과 참여 전문가(NETWORKS 원장).
  guestMasterTables: ['startups', 'networks'],
  basePath: '/project',
  detailBase: '/project',
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
  categoryNoun: '사업구분',
  overviewNoun: '사업개요',
  // 담기는 것이 기업과 사람 둘이라 회사로 부를 수 없다.
  rosterLabel: '참가자 목록',
  // 계정 후보는 담당자가 따로 꾸린 참가자 목록에서 고른다 — 이 워크스페이스에는 "누가
  // 참가하는가"를 이미 답하고 있는 업무 원장이 없다(사업은 담는 일 자체가 결정이다).
  rosterSource: { kind: 'entries' },
}

export function ProjectWorkspacePage() {
  const [params] = useSearchParams()

  // GUEST계정 발급 — 2026-09-07 저녁에 DATABASE에서 되돌아왔다(사용자 지정).
  //
  // 같은 날 오전에 옮긴 근거("게스트는 M&A·PROJECT 사업에도 걸리는데 AC를 읽지 못하는
  // 담당자에게는 창구가 없다")는 그날 안에 사라졌다 — PROJECT가 폐지되어 AC로 합쳐졌고,
  // 게스트가 실제로 걸려 있는 사업은 전부 AC다.
  //
  // ADMIN·OFFICE와 **같은 화면**을 세우고 권한만 낮춘다(`canSuspend` 없음 — 정지·해제는
  // ADMIN이 소유한다). 다른 것은 좁히는 축 둘이다.
  //
  //  · `entityKey` — 참여 사업 칸이 AC 사업만 센다(2026-09-07).
  //  · `masterTables` — **목록에 설 계정**을 이 창구가 발급하는 원장으로 좁힌다(2026-09-08).
  //    종전에는 계정이 전부 섰고 근거는 "사업 하나를 못 본다고 계정을 빼면 이미 있다는
  //    사실이 숨겨져 같은 대상에 발급을 다시 시도하게 된다"였다. M&A 창구가 서면 그
  //    근거가 사라진다 — 발급 대상이 다른 원장 행이라 재시도가 일어날 수 있는 같은
  //    대상이 아니고, 반대로 `ma_sellers` 인격이 여기 서면 그 사람 계정의 존재가 드러난다.
  if (params.get('tab') === 'guest-accounts') {
    return (
      <div className="space-y-5">
        <PageHeader title="와이앤아처 GUEST 계정" />
        <GuestAccountPanel
          entityKey={PROJECT_WORKSPACE.entityKey}
          masterTables={PROJECT_WORKSPACE.guestMasterTables}
        />
      </div>
    )
  }

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

export function ProjectBulkPage() {
  return (
    <ProgramWorkspaceProvider value={PROJECT_WORKSPACE}>
      <ProgramBulkPage />
    </ProgramWorkspaceProvider>
  )
}
