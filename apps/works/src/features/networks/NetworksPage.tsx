import { PageHeader } from '@ynarcher/ui'
import { Navigate, useSearchParams } from 'react-router-dom'
import { LIST_ALL_TAB, resolveListTab } from '@/config/navigation'
import { NetworkListTab } from '@/features/networks/NetworkListTab'
import { UnclassifiedTab } from '@/features/networks/UnclassifiedTab'

/**
 * 원장 통합(2026-09-04) 이전의 탭들 — 구분별 목록과 글로벌 목록은 모두 통합 목록으로
 * 합쳐졌다. 옛 주소로 들어오면 '전체 네트워크'로 바로잡는다.
 */
const RETIRED_TABS = new Set([
  'experts',
  'investors',
  'van',
  'exp',
  'corporates',
  'institutions',
  'universities',
  'etc',
  'vendors',
  'global',
  'global_mine',
])

export function NetworksPage() {
  const [params] = useSearchParams()
  const tab = resolveListTab(params.get('tab'))

  if (RETIRED_TABS.has(tab)) {
    return <Navigate to={`/networks?tab=${LIST_ALL_TAB}`} replace />
  }

  if (tab === 'others') {
    return (
      <div className="space-y-5">
        <PageHeader title="미분류 데이터베이스" />
        <UnclassifiedTab />
      </div>
    )
  }

  const scope = tab === LIST_ALL_TAB ? 'all' : 'mine'

  return (
    <div className="space-y-5">
      <PageHeader title={scope === 'all' ? '전체 네트워크' : '내 업로드 DB'} />
      <NetworkListTab key={scope} scope={scope} />
    </div>
  )
}
