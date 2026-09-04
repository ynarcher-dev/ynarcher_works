import { PageHeader } from '@ynarcher/ui'
import { Navigate, useSearchParams } from 'react-router-dom'
import { LIST_ALL_TAB, resolveListTab } from '@/config/navigation'
import { NetworkListTab } from '@/features/networks/NetworkListTab'

/**
 * 은퇴한 탭들 — 구분별 목록과 글로벌 목록은 원장 통합(2026-09-04)으로 통합 목록에 합쳐졌고,
 * 미분류 데이터베이스(`others`)는 같은 날 목록 구분 필터의 '미지정' 선택지로 내려갔다.
 * 옛 주소로 들어오면 '전체 네트워크'로 바로잡는다 — 북마크와 옛 링크가 빈 화면으로 끝나지 않게 한다.
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
  'others',
])

export function NetworksPage() {
  const [params] = useSearchParams()
  const tab = resolveListTab(params.get('tab'))

  if (RETIRED_TABS.has(tab)) {
    return <Navigate to={`/networks?tab=${LIST_ALL_TAB}`} replace />
  }

  const scope = tab === LIST_ALL_TAB ? 'all' : 'mine'

  return (
    <div className="space-y-5">
      <PageHeader title={scope === 'all' ? '전체 네트워크' : '내 업로드 DB'} />
      <NetworkListTab key={scope} scope={scope} />
    </div>
  )
}
