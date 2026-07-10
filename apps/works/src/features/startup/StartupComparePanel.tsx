import { useState } from 'react'
import { StartupCompareCard } from '@/features/startup/StartupCompareCard'
import { StartupComparePicker } from '@/features/startup/StartupComparePicker'
import { useEntity, type EntityRow } from '@/features/networks/hooks'

/**
 * 기업 비교 패널(상세페이지 우측 컬럼 최하단, 변동 이력 아래). 좌측은 현재 기업,
 * 우측은 모달에서 골라오는 비교기업. 상태(선택 id·모달)를 소유하고 표시는 카드가 담당한다.
 */
export function StartupComparePanel({ record }: { record: EntityRow }) {
  const [comparisonId, setComparisonId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const { data: comparison } = useEntity('startups', comparisonId ?? undefined)
  const b = comparisonId ? ((comparison ?? null) as EntityRow | null) : null
  const bLoading = comparisonId != null && !comparison

  return (
    <>
      <StartupCompareCard
        a={record}
        b={b}
        bLoading={bLoading}
        onSelectB={() => setPickerOpen(true)}
        onClearB={() => setComparisonId(null)}
      />
      <StartupComparePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(id) => setComparisonId(id)}
        excludeId={record.id}
      />
    </>
  )
}
