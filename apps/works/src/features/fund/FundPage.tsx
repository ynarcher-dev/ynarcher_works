import { EmptyState, PageHeader } from '@ynarcher/ui'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { FundListTab } from '@/features/fund/FundListTab'

/** 사이드바 탭 → 페이지 제목. */
const HEADINGS: Record<string, string> = {
  dashboard: '전체 펀드',
  mine: '내 펀드 관리',
  ac_fund: 'AC 펀드',
  vc_fund: 'VC 펀드',
  pe_fund: 'PE 펀드',
}

/** 구분 탭(AC/VC/PE) → strategy_type 프리필터 값. 리스트 테이블을 상속해 필터만 다르게 건다. */
const TAB_TO_STRATEGY: Record<string, 'AC' | 'VC' | 'PE' | undefined> = {
  ac_fund: 'AC',
  vc_fund: 'VC',
  pe_fund: 'PE',
}

/**
 * FUND 워크스페이스: 내 펀드 관리 / 전체 펀드 / AC·VC·PE 펀드. 섹션 전환은 좌측 사이드바(?tab).
 * '전체 펀드'(dashboard)는 전면 재설계를 위해 콘텐츠(KPI 타일·펀드 목록)를 비워 둔 상태이며,
 * 리스트 테이블(FundListTab)은 '내 펀드'와 AC/VC/PE 탭이 프리필터를 걸어 그대로 사용한다.
 * '내 펀드'는 생성자 또는 담당자(대표펀드매니저·운용인력·관리인력)가 나인 펀드를 모으며,
 * 탭 없이 진입했을 때의 기본 화면이다.
 * (StartupPage 패턴 미러링)
 */
export function FundPage() {
  const [params] = useSearchParams()
  const userId = useAuthStore((s) => s.user?.id)
  const tab = params.get('tab') ?? 'mine'
  const strategy = TAB_TO_STRATEGY[tab]
  const title = HEADINGS[tab] ?? HEADINGS.dashboard

  return (
    <div className="space-y-5">
      <PageHeader title={title} />

      {tab === 'dashboard' ? null : tab === 'mine' ? (
        <FundListTab key="mine" mineUserId={userId ?? null} />
      ) : strategy ? (
        <FundListTab key={strategy} strategy={strategy} />
      ) : (
        <EmptyState title={`${title} 준비 중`} description="해당 섹션은 준비 중입니다." />
      )}
    </div>
  )
}
