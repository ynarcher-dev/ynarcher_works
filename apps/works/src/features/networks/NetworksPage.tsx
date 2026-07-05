import { Button } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DirectoryTab } from '@/features/networks/DirectoryTab'
import { GrowthHistoryPanel } from '@/features/networks/GrowthHistoryPanel'
import { ImporterModal } from '@/features/networks/ImporterModal'
import { MergeConsole } from '@/features/networks/MergeConsole'
import { ENTITIES, type EntityKey } from '@/features/networks/config'

type Mode = 'directory' | 'merge' | 'growth'

const ENTITY_KEYS: EntityKey[] = ['startups', 'experts', 'partners']

/** NETWORKS 워크스페이스(마스터 원장). 섹션 전환은 좌측 사이드바(?tab)가 구동한다. */
export function NetworksPage() {
  const [params] = useSearchParams()
  const tab = params.get('tab') ?? 'startups'
  const [importing, setImporting] = useState(false)

  // 엔티티는 병합/성장 섹션 진입 시에도 유지되도록 내부 상태로 보존한다.
  const [entity, setEntity] = useState<EntityKey>('startups')
  useEffect(() => {
    if (ENTITY_KEYS.includes(tab as EntityKey)) setEntity(tab as EntityKey)
  }, [tab])

  const mode: Mode = tab === 'merge' ? 'merge' : tab === 'growth' ? 'growth' : 'directory'
  const config = ENTITIES[entity]

  const heading =
    mode === 'merge'
      ? '중복 병합 검증'
      : mode === 'growth'
        ? '성장 지표'
        : `${config.label} 마스터`

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-title-lg font-bold text-gray-900">
          NETWORKS · {heading}
        </h1>
        {mode === 'directory' && (
          <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
            대량 등록(CSV)
          </Button>
        )}
      </div>

      {mode === 'directory' && <DirectoryTab config={config} />}
      {mode === 'merge' && <MergeConsole config={config} />}
      {mode === 'growth' && <GrowthHistoryPanel />}

      <ImporterModal
        config={config}
        open={importing}
        onClose={() => setImporting(false)}
      />
    </div>
  )
}
