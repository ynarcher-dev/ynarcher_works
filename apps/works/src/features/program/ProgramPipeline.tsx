import { CircleHelp, Layers3 } from 'lucide-react'
import {
  Card,
  Skeleton,
  SummaryTile,
  TextAction,
  cn,
  type SummaryTileTone,
} from '@ynarcher/ui'
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
  onToggleStatus: (status: string) => void
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
  status: string | null
}

/** AC·M&A·PROJECT 공용 상태 현황. 순서나 흐름을 암시하지 않는 독립 타일형 요약이다. */
export function ProgramPipeline({
  mineUserId,
  keyword,
  filters,
  onToggleStatus,
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
  const statusKeys = groups
    .flatMap((group) => [...group.statuses, ...group.exits])
  const phaseByStatus = new Map(
    groups.flatMap((group) =>
      [...group.statuses, ...group.exits].map((status) => [status, group.label] as const),
    ),
  )

  const tiles: FlatStatus[] = [
    { key: 'TOTAL', label: `전체 ${config.entityNoun}`, eyebrow: '전체 현황', count: data.total, status: null },
    ...statusKeys.map((status) => ({
      key: status,
      label: PROGRAM_STATUS_LABEL[status] ?? status,
      eyebrow: phaseByStatus.get(status) ?? '운영 단계',
      count: data.byStatus[status] ?? 0,
      status,
    })),
    ...(data.other > 0
      ? [{ key: 'OTHER', label: '기타 상태', eyebrow: '운영 단계', count: data.other, status: null }]
      : []),
  ]

  return (
    <Card
      title={`${config.entityNoun} 현황`}
      actions={selectedStatuses.length > 0 ? <TextAction onClick={onClearStatuses}>상태 선택 해제</TextAction> : undefined}
    >
      <section
        aria-label={`${config.entityNoun} 상태별 현황`}
        className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3"
      >
        {tiles.map((tile, index) => {
          const Icon = tile.status ? PROGRAM_STATUS_ICON[tile.status] ?? CircleHelp : Layers3
          const selected = tile.status !== null && selectedStatuses.includes(tile.status)
          const canFilter = tile.status !== null

          return (
            <div
              key={tile.key}
              role={canFilter ? 'button' : undefined}
              tabIndex={canFilter ? 0 : undefined}
              aria-pressed={canFilter ? selected : undefined}
              onClick={canFilter ? () => onToggleStatus(tile.status as string) : undefined}
              onKeyDown={canFilter ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onToggleStatus(tile.status as string)
                }
              } : undefined}
              className={cn(
                'rounded-radius-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
                canFilter && 'cursor-pointer transition-transform duration-fast hover:-translate-y-0.5',
                selected && 'ring-2 ring-brand',
              )}
            >
              <SummaryTile
                title={tile.label}
                eyebrow={tile.eyebrow}
                value={tile.count}
                unit="건"
                tone={tile.key === 'TOTAL' ? 'primary' : STATUS_TONES[(index - 1) % STATUS_TONES.length]}
                className="h-full"
                icon={<Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />}
              />
            </div>
          )
        })}
      </section>
    </Card>
  )
}
