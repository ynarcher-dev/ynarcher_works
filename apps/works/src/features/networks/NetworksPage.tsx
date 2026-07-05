import { Button } from '@ynarcher/ui'
import { useState } from 'react'
import { DirectoryTab } from '@/features/networks/DirectoryTab'
import { GrowthHistoryPanel } from '@/features/networks/GrowthHistoryPanel'
import { ImporterModal } from '@/features/networks/ImporterModal'
import { MergeConsole } from '@/features/networks/MergeConsole'
import { ENTITIES, ENTITY_ORDER, type EntityKey } from '@/features/networks/config'

type Mode = 'directory' | 'merge' | 'growth'

const MODES: { key: Mode; label: string }[] = [
  { key: 'directory', label: '디렉토리' },
  { key: 'merge', label: '병합 콘솔' },
  { key: 'growth', label: '성장 지표' },
]

/** NETWORKS 워크스페이스(마스터 원장): 3단 디렉토리 + 병합 + 성장지표. */
export function NetworksPage() {
  const [entity, setEntity] = useState<EntityKey>('startups')
  const [mode, setMode] = useState<Mode>('directory')
  const [importing, setImporting] = useState(false)
  const config = ENTITIES[entity]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-title-lg font-bold text-gray-900">NETWORKS</h1>
        <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
          대량 등록(CSV)
        </Button>
      </div>

      {/* 엔티티 탭 */}
      <nav className="flex gap-1 border-b border-gray-200">
        {ENTITY_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setEntity(key)}
            className={
              entity === key
                ? 'border-b-2 border-brand px-3 py-2 text-body font-medium text-brand'
                : 'px-3 py-2 text-body text-gray-500 hover:text-gray-800'
            }
          >
            {ENTITIES[key].label}
          </button>
        ))}
      </nav>

      {/* 모드 탭 */}
      <div className="flex gap-2">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            className={
              mode === m.key
                ? 'rounded bg-brand-25 px-3 py-1 text-caption font-medium text-brand'
                : 'rounded px-3 py-1 text-caption text-gray-600 hover:bg-gray-100'
            }
          >
            {m.label}
          </button>
        ))}
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
