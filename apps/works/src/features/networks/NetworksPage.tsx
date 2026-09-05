import { PageHeader } from '@ynarcher/ui'
import { Navigate, useSearchParams } from 'react-router-dom'
import { NETWORKS_LIST_LABEL } from '@/config/navigation'
import { NetworkListTab } from '@/features/networks/NetworkListTab'
import { useListScope } from '@/lib/listScope'

/**
 * 네트워크 원장 목록 화면 — 메뉴 하나, 범위는 목록 안의 토글이 정한다.
 *
 * 2026-09-05: '내 업로드 DB'와 '전체 네트워크' 두 메뉴를 한 줄로 합쳤다. 둘은 같은 원장을
 * 같은 열·같은 필터로 보며 범위만 달랐는데, 범위를 메뉴로 두면 그것이 '어디에 있는가'가 되어
 * 지역·구분과 같은 축으로 함께 걸 수 없다(구분 필터·지역 필터가 2026-09-04에 먼저 밟은 길과
 * 같은 이유다). 범위는 자리가 아니라 축이므로 목록 상단의 토글(내 네트워크 / 전체 네트워크)
 * 한 칸이 답한다 — 좁혔다 넓히는 데 메뉴를 옮겨 다니며 검색어와 필터를 잃지 않는다.
 *
 * 옛 주소(`?tab=`)는 전부 이 화면으로 흡수한다 — 메뉴 둘이던 시절의 북마크와 구분별 원장
 * 시절의 링크(experts·global…)가 빈 화면으로 끝나지 않게 한다.
 */
export function NetworksPage() {
  const [params] = useSearchParams()
  const [scope, setScope] = useListScope()

  const legacyTab = params.get('tab')
  if (legacyTab) {
    // '내 업로드 DB'만 내 범위로 보내고 나머지(전체·구분별·글로벌·미분류)는 전체 범위로 간다.
    return <Navigate to={legacyTab === 'mine' ? '/networks' : '/networks?scope=all'} replace />
  }

  return (
    <div className="space-y-5">
      <PageHeader title={NETWORKS_LIST_LABEL} />
      <NetworkListTab scope={scope} onScopeChange={setScope} />
    </div>
  )
}
