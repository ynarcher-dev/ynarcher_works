import { EmptyState, Select, Spinner } from '@ynarcher/ui'
import { useState } from 'react'
import { RadarChart } from '@/features/networks/RadarChart'
import { useEntityList, useStartupGrowth } from '@/features/networks/hooks'

/** 성장 지표 히스토리: 스타트업 선택 → 멘토링 5대 지표 레이더. (7-8 연동) */
export function GrowthHistoryPanel() {
  const { data: startups } = useEntityList('startups', '')
  const [startupId, setStartupId] = useState('')
  const { data: growth, isLoading } = useStartupGrowth(startupId || undefined)

  const metrics = growth
    ? [
        { label: '기술성', value: growth.technology ?? 0 },
        { label: '사업성', value: growth.business_model ?? 0 },
        { label: '신뢰도', value: growth.credibility ?? 0 },
        { label: '협업', value: growth.collaboration ?? 0 },
        { label: '매칭성사', value: growth.matching_feasibility ?? 0 },
      ]
    : []

  return (
    <div className="space-y-4">
      <Select
        value={startupId}
        onChange={(e) => setStartupId(e.target.value)}
        className="max-w-xs"
      >
        <option value="">스타트업 선택</option>
        {(startups ?? []).map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>

      {!startupId && (
        <EmptyState title="스타트업을 선택하면 멘토링 5대 지표 레이더가 표시됩니다." />
      )}
      {startupId && isLoading && <Spinner />}
      {startupId && growth && growth.sample_count > 0 && (
        <div className="flex flex-col items-center">
          <RadarChart metrics={metrics} />
          <p className="mt-2 text-caption text-gray-500">
            멘토 진단 {growth.sample_count}건 평균
          </p>
        </div>
      )}
      {startupId && growth && growth.sample_count === 0 && !isLoading && (
        <EmptyState title="누적된 멘토 진단 데이터가 없습니다." />
      )}
    </div>
  )
}
