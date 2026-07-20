import { PageHeader, EmptyState } from '@ynarcher/ui'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { StartupPoolTab } from '@/features/startup/StartupPoolTab'
import { StartupDashboardTab } from '@/features/startup/StartupDashboardTab'
import { TAB_TO_STATUS } from '@/features/startup/startupClassification'

const HEADINGS: Record<string, string> = {
  dashboard: '대시보드',
  mine: '내 관리기업',
  invested: '투자기업',
  incubated: '보육기업',
  discovered: '발굴기업',
  etc: '기타기업',
  minutes: '회의록',
  archerscan: '아처스캔',
  bulk: '대용량 업로드',
}

/**
 * STARTUP 워크스페이스: 대시보드 / 내 관리기업 / 투자·보육·발굴·기타 기업 / 회의록 / 아처스캔.
 * 섹션 전환은 좌측 사이드바(?tab)가 구동한다.
 * 투자·보육·발굴·기타 4개 메뉴는 구분(management_status) 코드로 갈린 상호 배타 뷰다.
 * '내 관리기업'은 구분과 무관하게 담당자(startup_managers) 또는 등록자(created_by)가 나인 기업을 모은다.
 */
export function StartupPage() {
  const [params] = useSearchParams()
  const userId = useAuthStore((s) => s.user?.id)
  const tab = params.get('tab') ?? 'dashboard'
  const category = TAB_TO_STATUS[tab]

  // 검색창·필터·등록 버튼은 모두 StartupPoolTab의 컨트롤 행이 소유한다.
  return (
    <div className="space-y-5">
      {/* 대시보드는 페이지 타이틀 없이 카드부터 노출한다. */}
      {tab !== 'dashboard' && <PageHeader title={HEADINGS[tab] ?? HEADINGS.dashboard} />}

      {tab === 'mine' ? (
        <StartupPoolTab key="mine" category={null} mineUserId={userId ?? null} />
      ) : category ? (
        <StartupPoolTab category={category} />
      ) : tab === 'dashboard' ? (
        <StartupDashboardTab />
      ) : (
        <EmptyState
          title={`${HEADINGS[tab] ?? '대시보드'} 준비 중`}
          description="해당 섹션은 준비 중입니다."
        />
      )}
    </div>
  )
}
