import { sortRankRows, type StartupRankRow } from '@/features/startup/dashboard/startupDashboardCompute'

/** 원화 압축(45.0억 / 3,000만 / 1,200). 값 없으면 '-'. */
function won(v: number | null): string {
  if (v == null || v <= 0) return '-'
  if (v >= 1e12) return `${+(v / 1e12).toFixed(1)}조`
  if (v >= 1e8) return `${+(v / 1e8).toFixed(1)}억`
  if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만`
  return v.toLocaleString()
}

/**
 * 기업 랭킹 패널: 밸류(Pre) 내림차순 고정으로 이름·구분·단계·밸류·유치액·업력을 표로 노출한다.
 * 행 클릭 시 상세페이지로 이동한다.
 */
export function StartupRankingPanel({
  rows,
  onOpen,
  limit,
}: {
  rows: StartupRankRow[]
  onOpen: (r: StartupRankRow) => void
  limit?: number
}) {
  const sorted = sortRankRows(rows, 'valuation')
  const shown = limit ? sorted.slice(0, limit) : sorted
  const hidden = sorted.length - shown.length

  return (
    <div className="space-y-2">
      {shown.length === 0 ? (
        <p className="py-8 text-center text-caption text-gray-500">표시할 기업이 없습니다.</p>
      ) : (
        <table className="w-full text-caption">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-600">
              <th className="w-6 rounded-l-radius-sm py-1.5 pl-2 font-medium">#</th>
              <th className="py-1.5 font-medium">기업명</th>
              <th className="py-1.5 font-medium">구분</th>
              <th className="py-1.5 font-medium">단계</th>
              <th className="w-16 py-1.5 text-right font-medium">밸류</th>
              <th className="w-16 py-1.5 text-right font-medium">유치액</th>
              <th className="w-12 rounded-r-radius-sm py-1.5 pr-2 text-right font-medium">업력</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr
                key={r.id}
                onClick={() => onOpen(r)}
                className="cursor-pointer border-b border-gray-50 hover:bg-gray-50"
              >
                <td className="py-1.5 pl-2 tabular-nums text-gray-600">{i + 1}</td>
                <td className="py-1.5 font-medium text-gray-900">
                  <span className="block max-w-[7rem] truncate" title={r.name}>{r.name}</span>
                </td>
                <td className="py-1.5 text-gray-600">{r.category}</td>
                <td className="py-1.5 text-gray-600">{r.stage}</td>
                <td className="py-1.5 text-right tabular-nums text-gray-800">{won(r.valuation)}</td>
                <td className="py-1.5 text-right tabular-nums text-gray-600">{won(r.funding)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-gray-600">
                  {r.ageYears == null ? '-' : `${r.ageYears}년`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hidden > 0 && <p className="pt-0.5 text-right text-caption text-gray-600">외 {hidden}개</p>}
    </div>
  )
}
