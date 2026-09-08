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
  categoryNoun: '사업구분',
}

export function AcWorkspacePage() {
  const [params] = useSearchParams()

  // GUEST계정 발급 — 2026-09-07 저녁에 DATABASE에서 되돌아왔다(사용자 지정).
  //
  // 같은 날 오전에 옮긴 근거("게스트는 M&A·PROJECT 사업에도 걸리는데 AC를 읽지 못하는
  // 담당자에게는 창구가 없다")는 그날 안에 사라졌다 — PROJECT가 폐지되어 AC로 합쳐졌고,
  // 게스트가 실제로 걸려 있는 사업은 전부 AC다.
  //
  // ADMIN·OFFICE와 **같은 화면**을 세우고 권한만 낮춘다(`canSuspend` 없음 — 정지·해제는
  // ADMIN이 소유한다). 다른 것은 `entityKey` 하나뿐이다: 이 자리에서는 참여 사업 칸이
  // AC 사업만 센다. 사업 원장을 읽지 않으므로 목록과 나란한 분기다.
  if (params.get('tab') === 'guest-accounts') {
    return (
      <div className="space-y-5">
        <PageHeader title="GUEST계정 발급" />
        <GuestAccountPanel entityKey={AC_WORKSPACE.entityKey} />
      </div>
    )
  }

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
