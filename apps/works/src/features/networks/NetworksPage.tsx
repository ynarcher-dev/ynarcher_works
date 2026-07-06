import { Button, PageHeader, Input } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DirectoryTab } from '@/features/networks/DirectoryTab'
import { GrowthHistoryPanel } from '@/features/networks/GrowthHistoryPanel'
import { MergeConsole } from '@/features/networks/MergeConsole'
import { ENTITIES, ENTITY_ORDER, type EntityKey } from '@/features/networks/config'

type Mode = 'directory' | 'merge' | 'growth'

const ENTITY_KEYS: EntityKey[] = ENTITY_ORDER

/** NETWORKS 워크스페이스(마스터 원장). 섹션 전환은 좌측 사이드바(?tab)가 구동한다. */
export function NetworksPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab = params.get('tab') ?? 'experts'
  const [keyword, setKeyword] = useState('')

  // 엔티티는 병합/성장 섹션 진입 시에도 유지되도록 내부 상태로 보존한다.
  const [entity, setEntity] = useState<EntityKey>('experts')
  useEffect(() => {
    if (ENTITY_KEYS.includes(tab as EntityKey)) {
      setEntity(tab as EntityKey)
      setKeyword('')
    }
  }, [tab])

  const mode: Mode = tab === 'merge' ? 'merge' : tab === 'growth' ? 'growth' : 'directory'
  const config = ENTITIES[entity]

  const heading =
    mode === 'merge'
      ? '중복 병합 검증'
      : mode === 'growth'
        ? '성장 지표'
        : `${config.label} 네트워크`

  const searchField = mode === 'directory' ? (
    <Input
      placeholder={`${config.label} 이름 검색`}
      value={keyword}
      onChange={(e) => setKeyword(e.target.value)}
    />
  ) : undefined

  const actions = mode === 'directory' ? (
    <Button onClick={() => navigate(`/networks/${entity}/new`)}>
      {config.label} 등록
    </Button>
  ) : undefined

  return (
    <div className="space-y-5">
      <PageHeader
        title={heading}
        search={searchField}
        actions={actions}
      />

      {mode === 'directory' && (
        <DirectoryTab config={config} keyword={keyword} />
      )}
      {mode === 'merge' && <MergeConsole config={config} />}
      {mode === 'growth' && <GrowthHistoryPanel />}
    </div>
  )
}
