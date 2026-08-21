import { PageHeader } from '@ynarcher/ui'
import { Navigate, useSearchParams } from 'react-router-dom'
import { GLOBAL_MINE_TAB, LIST_ALL_TAB, resolveListTab } from '@/config/navigation'
import { DirectoryTab } from '@/features/networks/DirectoryTab'
import { GlobalNetworkTab } from '@/features/networks/GlobalNetworkTab'
import { NetworkListTab } from '@/features/networks/NetworkListTab'
import { ENTITIES } from '@/features/networks/config'

const RETIRED_ENTITY_TABS = new Set([
  'experts',
  'investors',
  'van',
  'exp',
  'corporates',
  'institutions',
  'universities',
  'etc',
  'vendors',
])

export function NetworksPage() {
  const [params] = useSearchParams()
  const tab = resolveListTab(params.get('tab'))

  if (RETIRED_ENTITY_TABS.has(tab)) {
    return <Navigate to={`/networks?tab=${LIST_ALL_TAB}`} replace />
  }

  if (tab === 'others') {
    return (
      <div className="space-y-5">
        <PageHeader title="미분류 데이터베이스" />
        <DirectoryTab config={ENTITIES.others} />
      </div>
    )
  }

  const isGlobal = tab === 'global' || tab === GLOBAL_MINE_TAB
  const isMine = tab === GLOBAL_MINE_TAB || (!isGlobal && tab !== LIST_ALL_TAB)
  const scope = isMine ? 'mine' : 'all'
  const heading = `${isMine ? '내 업로드 DB' : '전체 네트워크'} (${isGlobal ? '글로벌' : '국내'})`

  return (
    <div className="space-y-5">
      <PageHeader title={heading} />
      {isGlobal ? (
        <GlobalNetworkTab key={scope} scope={scope} />
      ) : (
        <NetworkListTab key={scope} scope={scope} />
      )}
    </div>
  )
}
