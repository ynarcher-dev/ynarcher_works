import { Select } from '@ynarcher/ui'
import { useState } from 'react'
import { MergeConsole } from '@/features/networks/MergeConsole'
import { CATEGORY_OPTIONS, type NetworkCategory } from '@/features/networks/config'

/**
 * ADMIN 중복 병합 검증: NETWORKS 중복 레코드를 정본으로 병합한다.
 *
 * 원장이 하나가 되면서(2026-09-04) '대상 원장'을 고르는 단계가 사라졌다. 대신 구분으로
 * 후보를 좁힌다 — 원장 전체를 한 드롭다운에 담으면 후보가 수천 건이 되어 고를 수 없다.
 * 구분을 비우면 전부가 후보이며, 서로 다른 구분에 따로 등록된 같은 사람은 그 상태에서만
 * 병합할 수 있다(통합 전에는 원장이 달라 아예 불가능했다).
 */
export function AdminMergePanel() {
  const [category, setCategory] = useState<NetworkCategory | ''>('experts')

  return (
    <div className="space-y-5">
      <div className="max-w-xs">
        <label className="text-body font-medium text-gray-800">구분</label>
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value as NetworkCategory | '')}
        >
          <option value="">전체(구분 무관)</option>
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <MergeConsole key={category || 'all'} category={category || undefined} />
    </div>
  )
}
