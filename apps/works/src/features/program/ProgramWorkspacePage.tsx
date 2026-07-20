import { PageHeader, EmptyState } from '@ynarcher/ui'
import { useSearchParams } from 'react-router-dom'
import { categoryFromTab } from '@/config/programCategories'
import { ProgramDashboardTab } from '@/features/program/ProgramDashboardTab'
import { ProgramListTab } from '@/features/program/ProgramListTab'
import { useProgramWorkspace } from '@/features/program/workspace'

/**
 * 사업 워크스페이스 페이지 컨테이너(AC/M&A/PROJECT 공용). 섹션 전환은 좌측 사이드바(?tab)가 구동한다.
 * - dashboard: 상태 요약 대시보드(STARTUP/NETWORKS 대시보드처럼 확장 예정)
 * - mine: 내가 담당자/등록자인 사업만
 * - 그 외: 사업구분(카테고리) 세분화 목록. tab이 소문자 카테고리 값(예: pe_fund)일 때 매칭된다.
 * - all: 사이드바에서는 제거된 전체 목록. 상세 뒤로가기 폴백·기존 북마크를 위해 계속 처리한다.
 * 섹션 제목의 도메인 명칭은 워크스페이스 config(entityNoun)로 조립한다.
 */
export function ProgramWorkspacePage() {
  const config = useProgramWorkspace()
  const [params] = useSearchParams()
  const tab = params.get('tab') ?? 'dashboard'
  const category = categoryFromTab(config.categories, tab)

  const headings: Record<string, string> = {
    dashboard: config.dashboardLabel,
    mine: config.mineLabel,
    all: `전체 ${config.entityNoun}`,
  }
  const heading = headings[tab] ?? category?.menuLabel ?? null

  return (
    <div className="space-y-5">
      {/* 대시보드를 포함한 모든 탭이 '메뉴명 + 구분선'으로 시작한다. 구분선은 PageHeader가 그린다. */}
      <PageHeader title={heading ?? headings.dashboard} />

      {tab === 'dashboard' ? (
        <ProgramDashboardTab />
      ) : tab === 'mine' ? (
        // key로 스코프 전환 시 검색·필터·페이지를 초기화한다.
        <ProgramListTab key="mine" scope="mine" backTab="mine" />
      ) : tab === 'all' ? (
        <ProgramListTab key="all" scope="all" backTab="all" />
      ) : category ? (
        <ProgramListTab
          key={tab}
          scope="all"
          category={category.value}
          includeUnclassified={category.includeUnclassified}
          backTab={tab}
        />
      ) : (
        <EmptyState
          title={`${heading ?? headings.dashboard} 준비 중`}
          description="해당 섹션은 준비 중입니다."
        />
      )}
    </div>
  )
}
