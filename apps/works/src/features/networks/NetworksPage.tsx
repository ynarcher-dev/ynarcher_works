import { Button, PageHeader, Input } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DashboardTab } from '@/features/networks/DashboardTab'
import { DirectoryTab } from '@/features/networks/DirectoryTab'
import { GlobalNetworkTab } from '@/features/networks/GlobalNetworkTab'
import { BulkUploadPanel } from '@/features/networks/BulkUploadPanel'
import { MyNetworkTab } from '@/features/networks/MyNetworkTab'
import { ENTITIES, DIRECTORY_ENTITIES, type EntityKey } from '@/features/networks/config'

type Mode = 'dashboard' | 'global' | 'directory' | 'bulk' | 'mine'

const ENTITY_KEYS: EntityKey[] = DIRECTORY_ENTITIES

/** NETWORKS 워크스페이스(마스터 원장). 섹션 전환은 좌측 사이드바(?tab)가 구동한다. */
export function NetworksPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab = params.get('tab') ?? 'dashboard'
  const [keyword, setKeyword] = useState('')

  // 엔티티는 병합 섹션 진입 시에도 유지되도록 내부 상태로 보존한다.
  const [entity, setEntity] = useState<EntityKey>('experts')
  useEffect(() => {
    if (ENTITY_KEYS.includes(tab as EntityKey)) {
      setEntity(tab as EntityKey)
      setKeyword('')
    }
    // 글로벌 탭 진입 시에도 이전 검색어를 비운다(디렉토리와 동일 UX).
    if (tab === 'global') setKeyword('')
  }, [tab])

  // 디렉토리 폴백보다 먼저 전용 섹션(내 네트워크 포함)을 판정한다.
  const mode: Mode =
    tab === 'dashboard'
      ? 'dashboard'
      : tab === 'global'
        ? 'global'
        : tab === 'bulk'
          ? 'bulk'
          : tab === 'mine'
            ? 'mine'
            : 'directory'
  const config = ENTITIES[entity]

  // 미분류(others)는 카테고리가 아닌 임시 저장소이므로 '미분류 데이터베이스'로 표기한다.
  const directoryHeading =
    entity === 'others' ? '미분류 데이터베이스' : `${config.label} 네트워크`
  const heading =
    mode === 'dashboard'
      ? '대시보드'
      : mode === 'global'
        ? '글로벌 네트워크'
        : mode === 'bulk'
          ? '대용량 업로드'
          : mode === 'mine'
            ? '내 네트워크'
            : directoryHeading

  const searchField = mode === 'directory' || mode === 'global' ? (
    <Input
      placeholder={mode === 'global' ? '글로벌 네트워크 이름 검색' : `${config.label} 이름 검색`}
      value={keyword}
      onChange={(e) => setKeyword(e.target.value)}
    />
  ) : undefined

  const actions = mode === 'directory' && entity !== 'others' ? (
    // 미분류 데이터베이스(others)는 분류 전 임시 저장소라 직접 등록하지 않는다.
    <Button onClick={() => navigate(`/networks/${entity}/new`)}>
      네트워크 등록
    </Button>
  ) : mode === 'global' ? (
    <Button onClick={() => navigate('/networks/global/new')}>네트워크 등록</Button>
  ) : undefined

  return (
    <div className="space-y-5">
      {/* 대시보드는 페이지 타이틀 없이 카드부터 노출한다(검색·액션도 없음). */}
      {mode !== 'dashboard' && (
        <PageHeader title={heading} search={searchField} actions={actions} />
      )}

      {mode === 'dashboard' && <DashboardTab />}
      {mode === 'global' && <GlobalNetworkTab keyword={keyword} />}
      {mode === 'directory' && (
        <DirectoryTab config={config} keyword={keyword} />
      )}
      {/* 내 네트워크는 10종 통합 목록이라 검색어를 탭이 직접 소유한다(상단 검색창 미사용). */}
      {mode === 'mine' && <MyNetworkTab />}
      {mode === 'bulk' && <BulkUploadPanel />}
    </div>
  )
}
