import { Button, PageHeader, Input } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DirectoryTab } from '@/features/networks/DirectoryTab'
import { MergeConsole } from '@/features/networks/MergeConsole'
import { BulkUploadPanel } from '@/features/networks/BulkUploadPanel'
import { ENTITIES, DIRECTORY_ENTITIES, type EntityKey } from '@/features/networks/config'

type Mode = 'directory' | 'merge' | 'bulk'

const ENTITY_KEYS: EntityKey[] = DIRECTORY_ENTITIES

/** NETWORKS 워크스페이스(마스터 원장). 섹션 전환은 좌측 사이드바(?tab)가 구동한다. */
export function NetworksPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab = params.get('tab') ?? 'experts'
  const [keyword, setKeyword] = useState('')

  // 엔티티는 병합 섹션 진입 시에도 유지되도록 내부 상태로 보존한다.
  const [entity, setEntity] = useState<EntityKey>('experts')
  useEffect(() => {
    if (ENTITY_KEYS.includes(tab as EntityKey)) {
      setEntity(tab as EntityKey)
      setKeyword('')
    }
  }, [tab])

  const mode: Mode = tab === 'merge' ? 'merge' : tab === 'bulk' ? 'bulk' : 'directory'
  const config = ENTITIES[entity]

  // 미분류(others)는 카테고리가 아닌 임시 저장소이므로 '미분류 데이터베이스'로 표기한다.
  const directoryHeading =
    entity === 'others' ? '미분류 데이터베이스' : `${config.label} 네트워크`
  const heading =
    mode === 'merge' ? '중복 병합 검증' : mode === 'bulk' ? '대용량 업로드' : directoryHeading

  const searchField = mode === 'directory' ? (
    <Input
      placeholder={`${config.label} 이름 검색`}
      value={keyword}
      onChange={(e) => setKeyword(e.target.value)}
    />
  ) : undefined

  const actions = mode === 'directory' ? (
    <Button onClick={() => navigate(`/networks/${entity}/new`)}>
      네트워크 등록
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
      {mode === 'bulk' && <BulkUploadPanel />}
    </div>
  )
}
