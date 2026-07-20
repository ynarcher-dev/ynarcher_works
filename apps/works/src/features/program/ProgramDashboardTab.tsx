import {
  StatusTileGrid,
  type StatTile,
} from '@/features/networks/dashboard/StatusTileGrid'
import { usePrograms } from '@/features/program/hooks'
import { useProgramWorkspace } from '@/features/program/workspace'

/**
 * 사업 대시보드(AC/M&A/PROJECT 공용): 사업 상태 요약 타일.
 * STARTUP/NETWORKS 대시보드처럼 카드형 분석 화면으로 확장 예정이며, 현재는 상태 타일만 노출한다.
 */
export function ProgramDashboardTab() {
  const config = useProgramWorkspace()
  const { data } = usePrograms()
  const programs = data ?? []
  const proposed = programs.filter((p) => p.status === 'PROPOSED').length
  const operating = programs.filter((p) => p.status === 'OPERATING').length

  const tiles: StatTile[] = [
    {
      key: 'total',
      label: `전체 ${config.entityNoun}`,
      value: programs.length.toLocaleString(),
      emphasis: true,
    },
    { key: 'proposed', label: '시도', value: proposed.toLocaleString() },
    { key: 'operating', label: '진행중', value: operating.toLocaleString() },
  ]

  return (
    <StatusTileGrid
      tiles={tiles}
      className="grid grid-cols-1 gap-2 sm:grid-cols-3"
    />
  )
}
