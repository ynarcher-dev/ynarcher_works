import { categoricalFill } from '@/features/networks/dashboard/chartPalette'
import type { CategoryDatum } from '@/features/networks/dashboard/CategoryBarList'

/**
 * 세로 막대(컬럼) 차트 — 대시보드 공용(NETWORKS·STARTUP 공통). 범주를 가로로 나란히 세워
 * 카드 안에서 세로 스크롤 없이 한눈에 보인다. 값은 막대 위, 라벨은 막대 아래(말줄임)에 두고,
 * 색은 범주별 팔레트 순환(0번=브랜드 레드), 기타·미지정은 무채색으로 마감한다.
 * `limit` 지정 시 상위 N개만, `minColWidth` 지정 시 각 열 최소폭을 강제해(모달) 넘치면 가로 스크롤한다.
 */
export function CategoryColumnChart({
  data,
  limit,
  minColWidth,
}: {
  data: CategoryDatum[]
  limit?: number
  minColWidth?: string
}) {
  const all = data.filter((d) => d.count > 0)
  if (all.length === 0) {
    return <p className="py-8 text-center text-caption text-gray-600">표시할 데이터가 없습니다.</p>
  }
  const cols = limit ? all.slice(0, limit) : all
  const max = Math.max(...cols.map((d) => d.count))
  return (
    <div className="flex h-full items-stretch gap-1">
      {cols.map((d, i) => {
        // 최댓값 막대도 꼭대기 숫자 공간이 남도록 82%까지만 채운다.
        const hPct = Math.max(8, Math.round((d.count / max) * 82))
        // 범주별 다채로운 색(0번=브랜드 레드 순환). 기타·미지정은 무채색(공용 규칙).
        const fill = categoricalFill(d.label, i)
        return (
          <div
            key={d.label}
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5"
            style={minColWidth ? { minWidth: minColWidth } : undefined}
          >
            <div className="flex w-full min-h-0 flex-1 items-end justify-center">
              {/* 값 라벨을 막대 꼭대기 바로 위에 얹어(absolute), 막대 높이를 따라 함께 오르내린다. */}
              <div
                className="relative w-full max-w-[1.1rem] rounded-t-[3px] transition-all"
                style={{ height: `${hPct}%`, backgroundColor: fill }}
              >
                <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-caption font-semibold leading-none tabular-nums text-gray-900">
                  {d.count.toLocaleString()}
                </span>
              </div>
            </div>
            <span
              className="w-full shrink-0 truncate text-center text-caption leading-tight text-gray-700"
              title={d.label}
            >
              {d.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
