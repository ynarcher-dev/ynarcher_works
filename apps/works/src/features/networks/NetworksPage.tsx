import { PageHeader, Input } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ListActions } from '@/components/ListActions'
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
 */
export function NetworksPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab = params.get('tab') ?? 'mine'
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

  const searchField = mode === 'directory' || mode === 'global' ? (
    <Input
      placeholder={mode === 'global' ? '글로벌 네트워크 이름 검색' : `${config.label} 이름 검색`}
      value={keyword}
      onChange={(e) => setKeyword(e.target.value)}
    />
  ) : undefined

  // 등록 버튼 문구는 `{대상 명사} 등록` 규칙을 따른다. 9종이 같은 버튼을 쓰는 화면이라
  // '네트워크 등록'으로 뭉뚱그리면 지금 어느 원장에 넣는 것인지가 버튼에 드러나지 않는다.
  const actions =
    mode === 'directory' ? (
      <ListActions
        // 미분류 데이터베이스(others)는 분류 전 임시 저장소라 직접 등록하지 않는다.
        // 다만 업로드가 미분류로 떨어지는 자리라 대용량 업로드는 여기에도 둔다.
        createLabel={entity === 'others' ? undefined : `${directoryHeading} 등록`}
        onCreate={entity === 'others' ? undefined : () => navigate(`/networks/${entity}/new`)}
        bulkTo="/networks/bulk"
      />
    ) : mode === 'global' ? (
      <ListActions
        createLabel="글로벌 네트워크 등록"
        onCreate={() => navigate('/networks/global/new')}
        bulkTo="/networks/bulk?scope=global"
      />
    ) : undefined

  return (
    <div className="space-y-5">
      {/* 대시보드를 포함한 모든 모드가 '메뉴명 + 구분선'으로 시작한다.
          단, 대시보드에는 검색·액션 컨트롤이 없으므로 제목만 노출한다. */}
      {mode === 'dashboard' ? (
        <PageHeader title={heading} />
      ) : (
        <PageHeader title={heading} search={searchField} actions={actions} />
      )}

      {mode === 'dashboard' && <DashboardTab />}
      {mode === 'global' && <GlobalNetworkTab keyword={keyword} />}
      {mode === 'directory' && (
        <DirectoryTab config={config} keyword={keyword} />
      )}
      {/* 내 네트워크는 10종 통합 목록이라 검색어를 탭이 직접 소유한다(상단 검색창 미사용). */}
      {mode === 'mine' && <MyNetworkTab />}
    </div>
  )
}
