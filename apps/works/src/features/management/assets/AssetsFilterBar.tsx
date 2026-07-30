import { FilterResetButton, MultiSelectFilter } from '@ynarcher/ui'
import {
  ACQUISITION_LABELS,
  ACQUISITION_ORDER,
  ASSET_LABELS,
  ASSET_STATUS_ORDER,
  BILLING_LABELS,
  BILLING_ORDER,
} from '@/features/management/config'
import {
  EMPTY_ASSET_FILTERS,
  hasActiveAssetFilters,
  type AssetFilters,
} from '@/features/management/assets/assetsApi'

interface AssetsFilterBarProps {
  filters: AssetFilters
  onChange: (next: AssetFilters) => void
}

const PORTABLE_OPTIONS = [
  { value: 'true', label: '반출 가능' },
  { value: 'false', label: '반출 불가' },
]

/**
 * 자산 목록 필터 바 — 상태·분류·결제주기·반출 가능 여부.
 * 값 체계는 모두 config의 라벨을 그대로 쓴다(표의 배지와 필터가 다른 말을 하지 않게).
 * 지사는 필터가 아니라 탭이다 — 자산은 지사로 먼저 갈리는 원장이므로 조건이 아니라 자리다.
 */
export function AssetsFilterBar({ filters, onChange }: AssetsFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectFilter
        label="상태"
        options={ASSET_STATUS_ORDER.map((v) => ({ value: v, label: ASSET_LABELS[v] }))}
        selected={filters.statuses}
        onChange={(statuses) => onChange({ ...filters, statuses })}
      />
      <MultiSelectFilter
        label="분류"
        options={ACQUISITION_ORDER.map((v) => ({ value: v, label: ACQUISITION_LABELS[v] }))}
        selected={filters.acquisitionTypes}
        onChange={(acquisitionTypes) => onChange({ ...filters, acquisitionTypes })}
      />
      <MultiSelectFilter
        label="결제 주기"
        options={BILLING_ORDER.map((v) => ({ value: v, label: BILLING_LABELS[v] }))}
        selected={filters.billingCycles}
        onChange={(billingCycles) => onChange({ ...filters, billingCycles })}
      />
      <MultiSelectFilter
        label="반출"
        options={PORTABLE_OPTIONS}
        selected={filters.portable}
        onChange={(portable) => onChange({ ...filters, portable })}
      />
      {hasActiveAssetFilters(filters) && (
        <FilterResetButton onClick={() => onChange(EMPTY_ASSET_FILTERS)} />
      )}
    </div>
  )
}
