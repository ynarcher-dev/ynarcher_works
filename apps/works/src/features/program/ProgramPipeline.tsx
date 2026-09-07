import { CircleHelp, Layers3 } from 'lucide-react'
import { Card, Skeleton, SummaryTile, type SummaryTileTone } from '@ynarcher/ui'
import {
  PROGRAM_STATUS_ICON,
  PROGRAM_STATUS_LABEL,
  programFlowGroups,
} from '@/features/program/config'
import {
  useProgramStatusCounts,
  type ProgramFilters as Filters,
} from '@/features/program/programsPoolHooks'
import { useProgramWorkspace } from '@/features/program/workspace'

interface ProgramPipelineProps {
  mineUserId: string | null
  keyword: string
  filters: Filters
  onToggleStatuses: (statuses: readonly string[]) => void
  onClearStatuses: () => void
}

const STATUS_TONES: SummaryTileTone[] = [
  'blue',
  'purple',
  'cyan',
  'amber',
  'peach',
  'rose',
  'lime',
  'mint',
]

interface FlatStatus {
  key: string
  label: string
  eyebrow: string
  count: number
  statuses: readonly string[]
}

/** AC·M&A·PROJECT 공용 상태 현황. 순서나 흐름을 암시하지 않는 독립 타일형 요약이다. */
export function ProgramPipeline({
  mineUserId,
  keyword,
  filters,
  onToggleStatuses,
  onClearStatuses,
}: ProgramPipelineProps) {
  const config = useProgramWorkspace()
  const { data, isPending } = useProgramStatusCounts(mineUserId, keyword, filters)
  const selectedStatuses = filters.statuses

  if (isPending) {
    return (
      <Card title={`${config.entityNoun} 현황`}>
        <Skeleton className="h-[7.5rem] w-full rounded-radius-lg" />
      </Card>
    )
  }
  if (!data) return null

  const groups = programFlowGroups(config.hasProposalStage)
  const statusKeys = groups.flatMap((group) => [...group.statuses, ...group.exits])
  const phaseByStatus = new Map(groups.flatMap((group) =>
    [...group.statuses, ...group.exits].map((status) => [status, group.label] as const),
  ))

  const primaryStatuses = ['PROPOSED', 'SELECTED', 'DRAFT', 'OPERATING', 'FINISHED'] as const
  const statusTiles: FlatStatus[] = config.hasProposalStage
    ? [
        ...primaryStatuses.map((status) => ({
          key: status,
          label: PROGRAM_STATUS_LABEL[status] ?? status,
          eyebrow: phaseByStatus.get(status) ?? '운영 단계',
          count: data.byStatus[status] ?? 0,
          statuses: [status],
        })),
        {
          key: 'NOT_SELECTED_CANCELLED',
          label: '미선정·취소',
          eyebrow: '종료 상태',
          count: (data.byStatus.NOT_SELECTED ?? 0) + (data.byStatus.CANCELLED ?? 0),
          statuses: ['NOT_SELECTED', 'CANCELLED'],
        },
      ]
    : statusKeys.map((status) => ({
        key: status,
        label: PROGRAM_STATUS_LABEL[status] ?? status,
        eyebrow: phaseByStatus.get(status) ?? '운영 단계',
        count: data.byStatus[status] ?? 0,
        statuses: [status],
      }))

  const tiles: FlatStatus[] = [
    { key: 'TOTAL', label: `전체 ${config.entityNoun}`, eyebrow: '전체 현황', count: data.total, statuses: [] },
    ...statusTiles,
    ...(data.other > 0
      ? [{ key: 'OTHER', label: '기타 상태', eyebrow: '운영 단계', count: data.other, statuses: [] }]
      : []),
  ]

  return (
    <Card title={`${config.entityNoun} 현황`}>
      <section
        aria-label={`${config.entityNoun} 상태별 현황`}
        className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3"
      >
        {tiles.map((tile, index) => {
          const firstStatus = tile.statuses[0]
          const Icon = firstStatus ? PROGRAM_STATUS_ICON[firstStatus] ?? CircleHelp : Layers3
          const isTotal = tile.key === 'TOTAL'
          const isSelected = tile.statuses.length > 0
            ? tile.statuses.every((status) => selectedStatuses.includes(status))
            : false

          return (
            <SummaryTile
              key={tile.key}
              title={tile.label}
              eyebrow={tile.eyebrow}
              value={tile.count}
              unit="건"
              tone={isTotal ? 'primary' : STATUS_TONES[(index - 1) % STATUS_TONES.length]}
              className="h-full"
              icon={<Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />}
              // 상태 타일은 그 상태의 필터이고, '전체'는 그 조건을 푸는 문이다 — 총계라고 못
              // 누르게 두면 되돌아올 자리가 필터 팝오버 안으로 숨는다(근태 현황과 같은 규약).
              // '기타 상태'만은 원장에 없는 값들의 묶음이라 걸 조건이 없어 누르지 않는다.
              onClick={
                tile.statuses.length > 0
                  ? () => onToggleStatuses(tile.statuses)
                  : isTotal
                    ? onClearStatuses
                    : undefined
              }
              selected={
                tile.statuses.length > 0
                  ? isSelected
                  : isTotal
                    ? selectedStatuses.length === 0
                    : undefined
              }
            />
          )
        })}
      </section>
    </Card>
  )
}
