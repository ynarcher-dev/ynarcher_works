import { useState } from 'react'
import type { ExpertRankRow } from '@/features/networks/dashboardHooks'

/** 평가랭킹 기준 탭. 활동 횟수 / 만족도 별점. */
const RANK_TABS = [
  { key: 'activity', label: '활동 횟수' },
  { key: 'satisfaction', label: '만족도' },
] as const

type RankMetric = (typeof RANK_TABS)[number]['key']

/** 세그먼트형 탭(디자인 토큰: gray 트랙 + gray.900 활성). */
function MetricTabs({ value, onChange }: { value: RankMetric; onChange: (m: RankMetric) => void }) {
  return (
    <div className="sticky top-0 z-sticky inline-flex gap-1 bg-white pb-1">
      {RANK_TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`rounded-radius-sm px-2.5 py-1 text-caption font-medium transition-colors ${
            value === t.key
              ? 'bg-gray-900 text-gray-0'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

/**
 * 전문가 평가랭킹 패널: 활동 횟수/만족도 탭 + 순위 표(이름·구분·분야·활동건·만족도).
 * 활동건·만족도는 실집계 연동 전이라 '-'로 표기하며, 선택 탭 기준 컬럼을 강조한다.
 */
export function ExpertRankingPanel({
  rows,
  onOpen,
  limit,
}: {
  rows: ExpertRankRow[]
  onOpen: (r: ExpertRankRow) => void
  limit?: number
}) {
  const [metric, setMetric] = useState<RankMetric>('activity')
  const sorted = [...rows].sort((a, b) => {
    const av = metric === 'activity' ? a.activity : a.satisfaction
    const bv = metric === 'activity' ? b.activity : b.satisfaction
    return (bv ?? -1) - (av ?? -1)
  })
  const shown = limit ? sorted.slice(0, limit) : sorted

  return (
    <div className="space-y-2">
      <MetricTabs value={metric} onChange={setMetric} />
      {shown.length === 0 ? (
        <p className="py-8 text-center text-caption text-gray-400">표시할 전문가가 없습니다.</p>
      ) : (
        <table className="w-full text-caption">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-400">
              <th className="w-6 py-1.5 font-medium">#</th>
              <th className="py-1.5 font-medium">이름</th>
              <th className="py-1.5 font-medium">구분</th>
              <th className="py-1.5 font-medium">분야</th>
              <th className={`w-14 py-1.5 text-right font-medium ${metric === 'activity' ? 'text-gray-700' : ''}`}>
                활동건
              </th>
              <th className={`w-12 py-1.5 text-right font-medium ${metric === 'satisfaction' ? 'text-gray-700' : ''}`}>
                만족도
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr
                key={`${r.entity}:${r.id}`}
                onClick={() => onOpen(r)}
                className="cursor-pointer border-b border-gray-50 hover:bg-gray-50"
              >
                <td className="py-1.5 tabular-nums text-gray-400">{i + 1}</td>
                <td className="py-1.5 font-medium text-gray-900">
                  <span className="block max-w-[6rem] truncate" title={r.name}>{r.name}</span>
                </td>
                <td className="py-1.5 text-gray-600">{r.category || '-'}</td>
                <td className="py-1.5 text-gray-500">
                  <span className="block max-w-[8rem] truncate" title={r.fields.join(', ')}>
                    {r.fields[0] ?? '-'}
                    {r.fields.length > 1 ? ` 외 ${r.fields.length - 1}` : ''}
                  </span>
                </td>
                <td className={`py-1.5 text-right tabular-nums ${metric === 'activity' ? 'font-semibold text-gray-800' : 'text-gray-400'}`}>
                  {r.activity ?? '-'}
                </td>
                <td className={`py-1.5 text-right tabular-nums ${metric === 'satisfaction' ? 'font-semibold text-gray-800' : 'text-gray-400'}`}>
                  {r.satisfaction != null ? r.satisfaction.toFixed(1) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
