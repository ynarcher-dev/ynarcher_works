import { EmptyState, PageHeader } from '@ynarcher/ui'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { LIST_ALL_TAB, resolveListTab } from '@/config/navigation'
import { StartupPoolTab } from '@/features/startup/StartupPoolTab'

const HEADINGS: Record<string, string> = {
  [LIST_ALL_TAB]: '스타트업 DB',
  mine: '내 업로드 DB',
  archerscan: '아처스캔',
}

const RETIRED_CATEGORY_TABS = new Set(['invested', 'incubated', 'discovered', 'etc', 'benchmark'])

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
      <PageHeader title={HEADINGS[tab] ?? HEADINGS[LIST_ALL_TAB]} />
      {tab === 'mine' ? (
        <StartupPoolTab key="mine" mineUserId={userId ?? null} />
      ) : tab === LIST_ALL_TAB ? (
        <StartupPoolTab key={LIST_ALL_TAB} />
      ) : (
        <EmptyState title={`${HEADINGS[tab] ?? HEADINGS[LIST_ALL_TAB]} 준비 중`} description="해당 섹션은 준비 중입니다." />
      )}
    </div>
  )
}
