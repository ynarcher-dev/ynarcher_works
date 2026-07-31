import { PageHeader } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DashboardTab } from '@/features/networks/DashboardTab'
import { DirectoryTab } from '@/features/networks/DirectoryTab'
import { GlobalNetworkTab } from '@/features/networks/GlobalNetworkTab'
import { MyNetworkTab } from '@/features/networks/MyNetworkTab'
import { ENTITIES, DIRECTORY_ENTITIES, type EntityKey } from '@/features/networks/config'

type Mode = 'dashboard' | 'global' | 'directory' | 'mine'

const ENTITY_KEYS: EntityKey[] = DIRECTORY_ENTITIES

/**
 * NETWORKS 워크스페이스(마스터 원장). 섹션 전환은 좌측 사이드바(?tab)가 구동한다.
 * 탭 없이 진입하면 사이드바 첫 항목인 '내 네트워크 관리'를 연다(navigation.ts 순서와 일치).
 *
 * 페이지는 '메뉴명 + 구분선'만 갖는다 — 검색·필터·액션은 목록의 조건이므로 각 탭이 한 컨트롤
 * 행에 모아 소유한다(STARTUP·AC 사업 페이지와 같은 규격). 종전처럼 헤더가 검색을, 탭이 필터를
 * 나눠 가지면 같은 목록의 조건이 두 줄로 갈라진다.
 */
export function NetworksPage() {
  const [params] = useSearchParams()
  const tab = params.get('tab') ?? 'mine'

  // 엔티티는 병합 섹션 진입 시에도 유지되도록 내부 상태로 보존한다.
  const [entity, setEntity] = useState<EntityKey>('experts')
  useEffect(() => {
    if (ENTITY_KEYS.includes(tab as EntityKey)) setEntity(tab as EntityKey)
  }, [tab])

  // 디렉토리 폴백보다 먼저 전용 섹션(내 네트워크 포함)을 판정한다.
  // 대용량 업로드는 더 이상 이 페이지의 탭이 아니라 전용 라우트(/networks/bulk)다 —
  // 목록의 '대용량 업로드' 버튼이 그 원장을 들고 이동한다.
  const mode: Mode =
    tab === 'dashboard'
      ? 'dashboard'
      : tab === 'global'
        ? 'global'
        : tab === 'mine'
          ? 'mine'
          : 'directory'
  const config = ENTITIES[entity]

  // 미분류(others)는 카테고리가 아닌 임시 저장소이므로 '미분류 데이터베이스'로 표기한다.
  const directoryHeading =
    entity === 'others' ? '미분류 데이터베이스' : `${config.label} 네트워크`
  const heading =
    mode === 'dashboard'
      ? '전체 네트워크'
      : mode === 'global'
        ? '글로벌 네트워크'
        : mode === 'mine'
          ? '내 네트워크 관리'
          : directoryHeading

  return (
    <div className="space-y-5">
      <PageHeader title={heading} />

      {mode === 'dashboard' && <DashboardTab />}
      {mode === 'global' && <GlobalNetworkTab />}
      {/* 원장이 바뀌면 검색어·필터·페이지가 이전 원장 것으로 남지 않도록 탭을 새로 마운트한다. */}
      {mode === 'directory' && <DirectoryTab key={config.key} config={config} />}
      {mode === 'mine' && <MyNetworkTab />}
    </div>
  )
}
