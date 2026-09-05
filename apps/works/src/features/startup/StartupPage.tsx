import { EmptyState, PageHeader } from '@ynarcher/ui'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { STARTUP_LIST_LABEL } from '@/config/navigation'
import { StartupPoolTab } from '@/features/startup/StartupPoolTab'
import { useListScope } from '@/lib/listScope'

/**
 * 아직 화면이 없는 탭. 사이드바에서는 내렸지만 라우팅은 살아 있다(?tab=archerscan) —
 * 범위 통합 뒤에도 이 값만은 옛 주소로 접지 않는다. 접으면 준비 중인 화면이 목록으로
 * 둔갑해, 나중에 붙일 자리가 어디였는지 주소에서도 사라진다.
 */
const PENDING_TABS: Record<string, string> = { archerscan: '아처스캔' }

/**
 * 스타트업 원장 목록 화면 — 메뉴 하나, 범위는 목록 안의 토글이 정한다.
 *
 * 2026-09-05: '내 업로드 DB'와 '스타트업 DB' 두 메뉴를 한 줄로 합쳤다. 둘은 같은 원장을
 * 같은 열·같은 필터로 보며 범위만 달랐고, 범위를 메뉴로 두면 그것이 '어디에 있는가'가 되어
 * 구분·단계 같은 다른 축과 함께 걸 수 없다(구분이 2026-08-20에 먼저 밟은 길과 같다).
 *
 * 옛 주소(`?tab=mine`·구분별 탭·`?tab=benchmark`)는 이 화면으로 흡수한다.
 */
export function StartupPage() {
  const [params] = useSearchParams()
  const userId = useAuthStore((state) => state.user?.id)
  const [scope, setScope] = useListScope()

  const tab = params.get('tab')
  const pending = tab ? PENDING_TABS[tab] : undefined

  if (tab && !pending) {
    return <Navigate to={tab === 'mine' ? '/startup' : '/startup?scope=all'} replace />
  }

  return (
    <div className="space-y-5">
      <PageHeader title={pending ?? STARTUP_LIST_LABEL} />
      {pending ? (
        <EmptyState title={`${pending} 준비 중`} description="해당 섹션은 준비 중입니다." />
      ) : (
        <StartupPoolTab scope={scope} onScopeChange={setScope} userId={userId ?? null} />
      )}
    </div>
  )
}
