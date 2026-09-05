import { PageHeader } from '@ynarcher/ui'
import { Navigate, useSearchParams } from 'react-router-dom'
import { NETWORKS_LIST_LABEL } from '@/config/navigation'
import { NetworkListTab } from '@/features/networks/NetworkListTab'
import type { NetworkListScope } from '@/features/networks/hooks'

/**
 * 네트워크 원장 목록 화면 — 메뉴 하나, 범위는 목록 안의 토글이 정한다.
 *
 * 2026-09-05: '내 업로드 DB'와 '전체 네트워크' 두 메뉴를 한 줄로 합쳤다. 둘은 같은 원장을
 * 같은 열·같은 필터로 보며 범위만 달랐는데, 범위를 메뉴로 두면 그것이 '어디에 있는가'가 되어
 * 지역·구분과 같은 축으로 함께 걸 수 없다(구분 필터·지역 필터가 2026-09-04에 먼저 밟은 길과
 * 같은 이유다). 범위는 자리가 아니라 축이므로 목록 상단의 토글(내 네트워크 / 전체 네트워크) 한 칸이
 * 답한다 — 좁혔다 넓히는 데 메뉴를 옮겨 다니며 검색어와 필터를 잃지 않는다.
 *
 * 범위를 주소(`?scope=`)에 싣는 이유는 링크가 범위까지 실어 나르기 위해서다 — 대시보드
 * '내 데이터베이스' 카드가 `?scope=mine`으로 들어오고, 상세 뒤로가기는 `?scope=all`로
 * 돌아온다(내 것이 아닌 레코드를 열었을 때 '내 네트워크' 목록에는 그 행이 없다).
 *
 * 옛 주소(`?tab=`)는 전부 이 화면으로 흡수한다 — 메뉴 둘이던 시절의 북마크와 구분별 원장
 * 시절의 링크(experts·global…)가 빈 화면으로 끝나지 않게 한다.
 */
export function NetworksPage() {
  const [params, setParams] = useSearchParams()

  const legacyTab = params.get('tab')
  if (legacyTab) {
    // '내 업로드 DB'만 내 범위로 보내고 나머지(전체·구분별·글로벌·미분류)는 전체 범위로 간다.
    return <Navigate to={legacyTab === 'mine' ? '/networks' : '/networks?scope=all'} replace />
  }

  const scope: NetworkListScope = params.get('scope') === 'all' ? 'all' : 'mine'

  // 기본 범위(내 네트워크)는 주소에 적지 않는다 — 같은 화면을 가리키는 주소가 둘이 되지 않게 한다.
  // 토글은 이동이 아니라 이 화면의 상태 변경이라 히스토리에 쌓지 않는다(replace).
  const changeScope = (next: NetworkListScope) =>
    setParams(next === 'all' ? { scope: 'all' } : {}, { replace: true })

  return (
    <div className="space-y-5">
      <PageHeader title={NETWORKS_LIST_LABEL} />
      <NetworkListTab scope={scope} onScopeChange={changeScope} />
    </div>
  )
}
