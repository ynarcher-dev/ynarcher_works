import { PageHeader, EmptyState } from '@ynarcher/ui'
import { useSearchParams } from 'react-router-dom'
import { AcDashboardTab } from '@/features/ac/AcDashboardTab'
import { AcWorkspaceTab } from '@/features/ac/AcWorkspaceTab'

const HEADINGS: Record<string, string> = {
  dashboard: '대시보드',
  mine: '내 사업',
  all: '전체 사업',
}

/**
 * AC 워크스페이스 페이지 컨테이너. 섹션 전환은 좌측 사이드바(?tab)가 구동한다.
 * - dashboard: 상태 요약 대시보드(STARTUP/NETWORKS 대시보드처럼 확장 예정)
 * - mine: 내가 담당자/등록자인 사업만
 * - all: 전체 사업
 */
export function AcDashboardPage() {
  const [params] = useSearchParams()
  const tab = params.get('tab') ?? 'dashboard'

  return (
    <div className="space-y-5">
      {/* 대시보드는 페이지 타이틀 없이 카드부터 노출한다. 사업 목록 탭은 타이틀 하단에 구분선을 둔다. */}
      {tab !== 'dashboard' && (
        <div className="border-b border-gray-200 pb-4">
          <PageHeader title={HEADINGS[tab] ?? HEADINGS.dashboard} />
        </div>
      )}

      {tab === 'dashboard' ? (
        <AcDashboardTab />
      ) : tab === 'mine' ? (
        // key로 스코프 전환 시 검색·필터·페이지를 초기화한다.
        <AcWorkspaceTab key="mine" scope="mine" />
      ) : tab === 'all' ? (
        <AcWorkspaceTab key="all" scope="all" />
      ) : (
        <EmptyState
          title={`${HEADINGS[tab] ?? '대시보드'} 준비 중`}
          description="해당 섹션은 준비 중입니다."
        />
      )}
    </div>
  )
}
