import {
  StatusTileGrid,
  type StatTile,
} from '@/features/networks/dashboard/StatusTileGrid'
import { usePrograms } from '@/features/ac/hooks'

/**
 * AC 대시보드: 프로그램 상태 요약 타일.
 * STARTUP/NETWORKS 대시보드처럼 카드형 분석 화면으로 확장 예정이며, 현재는 상태 타일만 노출한다.
 */
export function AcDashboardTab() {
  const { data } = usePrograms()
  const programs = data ?? []
  const proposed = programs.filter((p) => p.status === 'PROPOSED').length
  const operating = programs.filter((p) => p.status === 'OPERATING').length

  const tiles: StatTile[] = [
    {
      key: 'total',
      label: '전체 사업',
      value: programs.length.toLocaleString(),
      emphasis: true,
    },
    { key: 'proposed', label: '제안', value: proposed.toLocaleString() },
    { key: 'operating', label: '진행중', value: operating.toLocaleString() },
  ]

  return (
    <StatusTileGrid
      tiles={tiles}
      className="grid grid-cols-1 gap-2 sm:grid-cols-3"
    />
  )
}
