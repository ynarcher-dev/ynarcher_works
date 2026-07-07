import { Select } from '@ynarcher/ui'
import { useState } from 'react'
import { MergeConsole } from '@/features/networks/MergeConsole'
import { DIRECTORY_ENTITIES, ENTITIES, type EntityKey } from '@/features/networks/config'

/**
 * ADMIN 중복 병합 검증: NETWORKS 마스터 각 네트워크(엔티티)를 골라 중복 레코드를 정본으로 병합한다.
 * NETWORKS 디렉토리와 달리 엔티티 컨텍스트가 없으므로 상단에서 대상 네트워크를 직접 선택한다.
 */
export function AdminMergePanel() {
  const [entity, setEntity] = useState<EntityKey>('experts')
  const config = ENTITIES[entity]

  return (
    <div className="space-y-5">
      <div className="max-w-xs">
        <label className="text-body font-medium text-gray-800">대상 네트워크</label>
        <Select value={entity} onChange={(e) => setEntity(e.target.value as EntityKey)}>
          {DIRECTORY_ENTITIES.map((key) => (
            <option key={key} value={key}>
              {key === 'others' ? '미분류 데이터베이스' : `${ENTITIES[key].label} 네트워크`}
            </option>
          ))}
        </Select>
      </div>
      <MergeConsole key={entity} config={config} />
    </div>
  )
}
