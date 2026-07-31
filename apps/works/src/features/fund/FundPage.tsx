import { EmptyState, PageHeader } from '@ynarcher/ui'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { LIST_ALL_TAB, resolveListTab } from '@/config/navigation'
import { FundListTab } from '@/features/fund/FundListTab'

/** 사이드바 탭 → 페이지 제목. */
const HEADINGS: Record<string, string> = {
  [LIST_ALL_TAB]: '전체 펀드',
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
 * 네 목록 모두 같은 리스트 테이블(FundListTab)을 쓰고 거는 조건만 다르다 —
 * '내 펀드'는 생성자 또는 담당자(대표펀드매니저·운용인력·관리인력)가 나인 펀드로 좁히고,
 * AC/VC/PE는 구분(strategy_type) 프리필터를 걸며, '전체 펀드'는 아무것도 걸지 않는다.
 * '내 펀드'가 탭 없이 진입했을 때의 기본 화면이다.
 * (StartupPage 패턴 미러링)
 */
export function FundPage() {
  const [params] = useSearchParams()
  const userId = useAuthStore((s) => s.user?.id)
  const tab = resolveListTab(params.get('tab'))
  const strategy = TAB_TO_STRATEGY[tab]
  const title = HEADINGS[tab] ?? HEADINGS[LIST_ALL_TAB]

  return (
    <div className="space-y-5">
      <PageHeader title={title} />

      {tab === 'mine' ? (
        <FundListTab key="mine" mineUserId={userId ?? null} />
      ) : tab === LIST_ALL_TAB ? (
        // 내 펀드 관리와 같은 목록. 구분 프리필터도 담당자 스코프도 걸지 않는다.
        <FundListTab key={LIST_ALL_TAB} />
      ) : strategy ? (
        <FundListTab key={strategy} strategy={strategy} />
      ) : (
        <EmptyState title={`${title} 준비 중`} description="해당 섹션은 준비 중입니다." />
      )}
    </div>
  )
}
