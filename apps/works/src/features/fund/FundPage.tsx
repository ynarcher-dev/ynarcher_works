import { EmptyState, PageHeader } from '@ynarcher/ui'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { FundListTab } from '@/features/fund/FundListTab'
import { formatEok, useFundList } from '@/features/fund/fundListHooks'

/** 사이드바 탭 → 페이지 제목. */
const HEADINGS: Record<string, string> = {
  dashboard: '펀드 현황',
  mine: '내 펀드 관리',
  ac_fund: 'AC 펀드',
  vc_fund: 'VC 펀드',
  pe_fund: 'PE 펀드',
}

/** 구분 탭(AC/VC/PE) → strategy_type 프리필터 값. 대시보드 테이블을 상속해 필터만 다르게 건다. */
const TAB_TO_STRATEGY: Record<string, 'AC' | 'VC' | 'PE' | undefined> = {
  ac_fund: 'AC',
  vc_fund: 'VC',
  pe_fund: 'PE',
}

/**
 * FUND 워크스페이스: 펀드 현황 / 내 펀드 관리 / AC·VC·PE 펀드. 섹션 전환은 좌측 사이드바(?tab).
 * 대시보드의 펀드 리스트 테이블(FundListTab) 하나를 AC/VC/PE 탭이 유형구분 프리필터로 상속한다.
 * '내 펀드'는 등록자 또는 대표펀드매니저가 나인 펀드를 모은다. (StartupPage 패턴 미러링)
 */
export function FundPage() {
  const [params] = useSearchParams()
  const userId = useAuthStore((s) => s.user?.id)
  const tab = params.get('tab') ?? 'dashboard'
  const { data, isLoading } = useFundList()
  const funds = data ?? []
  const strategy = TAB_TO_STRATEGY[tab]
  const title = HEADINGS[tab] ?? HEADINGS.dashboard

  const totalCommit = funds.reduce((s, f) => s + f.total_commitment, 0)
  const totalDrawn = funds.reduce((s, f) => s + f.drawn_amount, 0)
  const kpi = [
    { label: '펀드 수', value: isLoading ? '…' : String(funds.length) },
    { label: '총 결성액', value: isLoading ? '…' : formatEok(totalCommit) },
    { label: '총 집행액', value: isLoading ? '…' : formatEok(totalDrawn) },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title={title} />

      {tab === 'dashboard' && (
        <div className="grid grid-cols-3 gap-3">
          {kpi.map((t) => (
            <div key={t.label} className="rounded border border-gray-300 bg-white px-4 py-3">
              <p className="text-caption text-gray-600">{t.label}</p>
              <p className="text-title-md font-bold tabular-nums text-gray-900">{t.value}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'dashboard' ? (
        <FundListTab />
      ) : tab === 'mine' ? (
        <FundListTab key="mine" mineUserId={userId ?? null} />
      ) : strategy ? (
        <FundListTab key={strategy} strategy={strategy} />
      ) : (
        <EmptyState title={`${title} 준비 중`} description="해당 섹션은 준비 중입니다." />
      )}
    </div>
  )
}
