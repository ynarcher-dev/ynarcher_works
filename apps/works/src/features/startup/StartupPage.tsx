import { EmptyState, PageHeader } from '@ynarcher/ui'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { BENCHMARK_TAB, LIST_ALL_TAB, resolveListTab } from '@/config/navigation'
import { StartupBenchmarkTab } from '@/features/startup/StartupBenchmarkTab'
import { StartupPoolTab } from '@/features/startup/StartupPoolTab'

const HEADINGS: Record<string, string> = {
  [LIST_ALL_TAB]: '스타트업 DB',
  mine: '내 업로드 DB',
  [BENCHMARK_TAB]: '벤치마크',
  archerscan: '아처스캔',
}

/** 메뉴명만으로 무엇을 하는 화면인지 읽히지 않는 탭의 한 줄 설명. */
const DESCRIPTIONS: Record<string, string> = {
  [BENCHMARK_TAB]:
    '기업을 나란히 세워 같은 기준연도의 재무·매출·고용·투자 지표를 비교합니다. 비교군은 주소에 남으므로 링크를 그대로 공유할 수 있습니다.',
}

const RETIRED_CATEGORY_TABS = new Set(['invested', 'incubated', 'discovered', 'etc'])

export function StartupPage() {
  const [params, setParams] = useSearchParams()
  const userId = useAuthStore((state) => state.user?.id)
  const raw = resolveListTab(params.get('tab'))
  const retired = RETIRED_CATEGORY_TABS.has(raw)
  const tab = retired ? LIST_ALL_TAB : raw

  useEffect(() => {
    if (retired) setParams({ tab: LIST_ALL_TAB }, { replace: true })
  }, [retired, setParams])

  return (
    <div className="space-y-5">
      <PageHeader title={HEADINGS[tab] ?? HEADINGS[LIST_ALL_TAB]} description={DESCRIPTIONS[tab]} />
      {tab === 'mine' ? (
        <StartupPoolTab key="mine" mineUserId={userId ?? null} />
      ) : tab === LIST_ALL_TAB ? (
        <StartupPoolTab key={LIST_ALL_TAB} />
      ) : tab === BENCHMARK_TAB ? (
        <StartupBenchmarkTab />
      ) : (
        <EmptyState title={`${HEADINGS[tab] ?? HEADINGS[LIST_ALL_TAB]} 준비 중`} description="해당 섹션은 준비 중입니다." />
      )}
    </div>
  )
}
