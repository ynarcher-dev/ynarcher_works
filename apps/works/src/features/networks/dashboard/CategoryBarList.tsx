import { CHART_NEUTRAL, CHART_PRIMARY, categoricalFill, isNeutralLabel } from '@/features/networks/dashboard/chartPalette'

export interface CategoryDatum {
  label: string
  count: number
}

/**
 * 가로 막대 리스트(단일 지표). 라벨·값을 막대 위에 얹고 막대는 전체폭으로 그린다.
 * 막대 길이는 최댓값 기준(가독성), 표기 값은 실제 건수와 전체 대비 비율이다.
 * `limit` 지정 시 상위 N개만 노출하고 나머지는 '외 N개'로 요약(전체는 전체보기 모달에서).
 * `colorful` 지정 시 막대색을 범주별 팔레트로 순환(미지정 시 단색 — NETWORKS 기존 동작).
 * 비율·막대 스케일은 잘라내기 전 전체 기준으로 계산해 카드/모달이 일치한다.
 */
export function CategoryBarList({
  data,
  limit,
  colorful,
}: {
  data: CategoryDatum[]
  limit?: number
  colorful?: boolean
}) {
  const all = data.filter((d) => d.count > 0)
  if (all.length === 0) {
    return <p className="py-8 text-center text-caption text-gray-600">표시할 데이터가 없습니다.</p>
  }
  const total = all.reduce((s, d) => s + d.count, 0) || 1
  const max = Math.max(...all.map((d) => d.count))
  const rows = limit ? all.slice(0, limit) : all
  const hidden = all.length - rows.length
  return (
    <ul className="space-y-3">
      {rows.map((d, i) => {
        const pct = Math.round((d.count / total) * 100)
        const barPct = Math.max(4, Math.round((d.count / max) * 100))
        return (
          <li key={d.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-caption font-medium text-gray-700" title={d.label}>
                {d.label}
              </span>
              <span className="shrink-0 text-caption tabular-nums text-gray-700">
                <span className="font-semibold text-gray-800">{d.count.toLocaleString()}</span>
                <span className="ml-1">{pct}%</span>
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${barPct}%`,
                  backgroundColor: colorful
                    ? categoricalFill(d.label, i)
                    : isNeutralLabel(d.label)
                      ? CHART_NEUTRAL
                      : CHART_PRIMARY,
                }}
              />
            </div>
          </li>
        )
      })}
      {hidden > 0 && (
        <li className="pt-0.5 text-right text-caption text-gray-700">외 {hidden}개</li>
      )}
    </ul>
  )
}
