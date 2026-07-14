import { Badge, Spinner } from '@ynarcher/ui'
import { useNavigate } from 'react-router-dom'
import {
  KANBAN_STAGES,
  NEXT_STAGE,
  STAGE_LABELS,
  TERMINAL_STAGES,
  stageTone,
  type DealStage,
} from '@/features/mna/config'
import { useDeals, useUpdateDealStage, type Deal } from '@/features/mna/hooks'

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function eok(v: number | null): string {
  return v == null ? '-' : `${(v / 100_000_000).toLocaleString()}억`
}

function DealCard({ deal }: { deal: Deal }) {
  const navigate = useNavigate()
  const update = useUpdateDealStage()
  const next = NEXT_STAGE[deal.stage]

  return (
    <div className="rounded-radius-md border border-gray-300 bg-white p-3 shadow-soft">
      <button
        type="button"
        onClick={() => navigate(`/mna/${deal.id}`)}
        className="block text-left"
      >
        <p className="text-body font-semibold text-gray-900">{deal.deal_name}</p>
        <p className="text-caption text-gray-500">
          {deal.target_name ?? '대상 미지정'}
        </p>
      </button>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-caption tabular-nums text-gray-600">
          {eok(deal.estimated_value)}
        </span>
        <div className="flex items-center gap-1">
          {deal.on_hold && <Badge tone="danger">보류</Badge>}
          <span className="text-caption text-gray-400">
            {daysSince(deal.updated_at)}일 경과
          </span>
        </div>
      </div>
      {next && (
        <button
          type="button"
          disabled={update.isPending}
          onClick={() => update.mutate({ id: deal.id, stage: next })}
          className="mt-2 w-full rounded-radius-md border border-gray-300 py-1 text-caption text-gray-600 transition-all duration-fast hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10 disabled:opacity-50"
        >
          {STAGE_LABELS[next]}(으)로 이동 →
        </button>
      )}
    </div>
  )
}

function Column({ stage, deals }: { stage: DealStage; deals: Deal[] }) {
  return (
    <div className="flex w-64 shrink-0 flex-col rounded-radius-lg bg-gray-50 p-2">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-body font-semibold text-gray-800">
          {STAGE_LABELS[stage]}
        </span>
        <Badge tone={stageTone[stage]}>{deals.length}</Badge>
      </div>
      <div className="space-y-2">
        {deals.map((d) => (
          <DealCard key={d.id} deal={d} />
        ))}
        {deals.length === 0 && (
          <p className="px-1 py-4 text-center text-caption text-gray-400">
            딜 없음
          </p>
        )}
      </div>
    </div>
  )
}

/** M&A 딜 소싱 칸반 보드(6열: 진행 5단계 + 완료/무산 종료 열). */
export function KanbanBoard() {
  const { data, isLoading } = useDeals()
  if (isLoading) return <Spinner />
  const deals = data ?? []

  const byStage = (s: DealStage) => deals.filter((d) => d.stage === s)
  const terminal = deals.filter((d) => TERMINAL_STAGES.includes(d.stage))

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {KANBAN_STAGES.map((s) => (
        <Column key={s} stage={s} deals={byStage(s)} />
      ))}
      <div className="flex w-64 shrink-0 flex-col rounded-radius-lg bg-gray-50 p-2">
        <div className="flex items-center justify-between px-1 pb-2">
          <span className="text-body font-semibold text-gray-800">완료/무산</span>
          <Badge tone="neutral">{terminal.length}</Badge>
        </div>
        <div className="space-y-2">
          {terminal.map((d) => (
            <DealCard key={d.id} deal={d} />
          ))}
          {terminal.length === 0 && (
            <p className="px-1 py-4 text-center text-caption text-gray-400">
              딜 없음
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
