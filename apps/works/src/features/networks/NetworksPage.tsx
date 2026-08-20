import { PageHeader } from '@ynarcher/ui'
import { Navigate, useSearchParams } from 'react-router-dom'
import { GLOBAL_MINE_TAB, LIST_ALL_TAB, resolveListTab } from '@/config/navigation'
import { DirectoryTab } from '@/features/networks/DirectoryTab'
import { GlobalNetworkTab } from '@/features/networks/GlobalNetworkTab'
import { NetworkListTab } from '@/features/networks/NetworkListTab'
import { ENTITIES } from '@/features/networks/config'

/**
 * 사이드바에서 내려간 원장별 탭. 2026-08-20에 원장별 메뉴를 국내 통합 목록의 필터로 옮기면서
 * 죽은 키가 됐다. 화면만 바꾸지 않고 주소까지 국내 전체 목록으로 바로잡는다 — 죽은 탭이
 * 주소에 남으면 사이드바에 활성 항목이 없어 지금 어느 메뉴에 있는지가 사라진다.
 * (`vendors`는 은퇴 원장이라 메뉴가 있던 적이 없지만, 같은 이유로 함께 받아 준다.)
 */
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

/**
 * NETWORKS 워크스페이스(마스터 원장). 섹션 전환은 좌측 사이드바(?tab)가 구동한다.
 * 탭 없이 진입하면 사이드바 첫 항목인 '내 업로드 DB (국내)'를 연다(navigation.ts 순서와 일치).
 *
 * 화면은 셋이다 — 국내 통합 목록(범위 2), 글로벌 목록(범위 2), 미분류 데이터베이스.
 * 국내와 글로벌을 가르는 것은 열이다(글로벌만 권역·국가·링크드인을 갖는다). 미분류는 분류 전
 * 임시 저장소라 구분 이관 드롭다운이라는 자기 조작을 갖는다.
 *
 * 페이지는 '메뉴명 + 구분선'만 갖는다 — 검색·필터·액션은 목록의 조건이므로 각 탭이 한 컨트롤
 * 행에 모아 소유한다(STARTUP·AC 사업 페이지와 같은 규격).
 */
export function NetworksPage() {
  const [params] = useSearchParams()
  const tab = resolveListTab(params.get('tab'))

  if (RETIRED_ENTITY_TABS.has(tab)) {
    return <Navigate to={`/networks?tab=${LIST_ALL_TAB}`} replace />
  }

  if (tab === 'others') {
    const config = ENTITIES.others
    return (
      <div className="space-y-5">
        {/* 미분류(others)는 카테고리가 아닌 임시 저장소이므로 '미분류 데이터베이스'로 표기한다. */}
        <PageHeader title="미분류 데이터베이스" />
        <DirectoryTab config={config} />
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
      {/* 내 것과 전체는 같은 목록이고 범위만 다르다. key로 범위 전환 시 검색·필터·페이지를 초기화한다. */}
      {isGlobal ? (
        <GlobalNetworkTab key={scope} scope={scope} />
      ) : (
        <NetworkListTab key={scope} scope={scope} />
      )}
    </div>
  )
}
