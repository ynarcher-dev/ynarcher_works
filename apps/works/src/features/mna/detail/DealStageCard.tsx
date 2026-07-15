import { Badge, Button, Card, useToast, type BadgeTone } from '@ynarcher/ui'
import { Check } from 'lucide-react'
import {
  KANBAN_STAGES,
  NEXT_STAGE,
  STAGE_LABELS,
  type DealStage,
} from '@/features/mna/config'
import { useUpdateDealStage, type Deal, type StageLog } from '@/features/mna/hooks'

type StepState = 'done' | 'current' | 'pending'

const STEP_BADGE: Record<StepState, { label: string; tone: BadgeTone }> = {
  done: { label: '완료', tone: 'info' },
  current: { label: '진행', tone: 'success' },
  pending: { label: '대기', tone: 'neutral' },
}

/** 각 단계에 최초 진입한 날짜(타임라인 로그 기준). */
function enteredAt(logs: StageLog[], stage: DealStage): string | null {
  const hit = [...logs]
    .reverse()
    .find((l) => l.to_stage === stage)
  return hit ? hit.created_at.slice(0, 10) : null
}

/**
 * 딜 진행 단계 스텝퍼(상세 좌측 카드).
 * 소싱→예비 실사→정밀 실사→조건 협상→계약 5단계 + 종결(완료/무산) 상태를 표시하고,
 * 우측 액션으로 다음 단계 전환을 제공한다(로그는 DB 트리거가 자동 기록).
 */
export function DealStageCard({ deal, logs }: { deal: Deal; logs: StageLog[] }) {
  const toast = useToast()
  const updateStage = useUpdateDealStage()
  const next = NEXT_STAGE[deal.stage]
  const currentIdx = KANBAN_STAGES.indexOf(deal.stage)
  const completed = deal.stage === 'COMPLETED'
  const aborted = deal.stage === 'ABORTED'

  const stateOf = (idx: number): StepState => {
    if (completed) return 'done'
    if (aborted) return 'pending'
    if (idx < currentIdx) return 'done'
    if (idx === currentIdx) return 'current'
    return 'pending'
  }

  const onAdvance = async () => {
    if (!next) return
    if (!window.confirm(`'${STAGE_LABELS[next]}' 단계로 전환하시겠습니까?`)) return
    try {
      await updateStage.mutateAsync({ id: deal.id, stage: next })
      toast.show(`${STAGE_LABELS[next]} 단계로 전환했습니다.`, 'success')
    } catch {
      toast.show('단계 전환에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Card
      title="진행 단계"
      subtitle="단계 전환 시 타임라인 로그가 자동 기록됩니다."
      actions={
        next && !deal.on_hold ? (
          <Button size="sm" onClick={() => void onAdvance()} disabled={updateStage.isPending}>
            {STAGE_LABELS[next]}(으)로 전환 →
          </Button>
        ) : deal.on_hold ? (
          <Badge tone="danger">보류 중</Badge>
        ) : undefined
      }
    >
      <ol className="space-y-2">
        {KANBAN_STAGES.map((stage, idx) => {
          const state = stateOf(idx)
          const badge = STEP_BADGE[state]
          const date = enteredAt(logs, stage)
          return (
            <li
              key={stage}
              className={`flex items-center gap-3 rounded-radius-md border px-4 py-2.5 ${
                state === 'current'
                  ? 'border-success-border bg-success-subtle/40'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-caption font-semibold ${
                  state === 'done'
                    ? 'bg-info text-gray-0'
                    : state === 'current'
                      ? 'bg-success text-gray-0'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {state === 'done' ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </span>
              <span className="text-body font-medium text-gray-900">
                {STAGE_LABELS[stage]}
              </span>
              <Badge tone={badge.tone} size="sm">
                {badge.label}
              </Badge>
              <span className="ml-auto text-caption tabular-nums text-gray-400">
                {date ?? ''}
              </span>
            </li>
          )
        })}
        {(completed || aborted) && (
          <li
            className={`flex items-center gap-3 rounded-radius-md border px-4 py-2.5 ${
              completed
                ? 'border-success-border bg-success-subtle/40'
                : 'border-danger-border bg-danger-subtle/40'
            }`}
          >
            <Badge tone={completed ? 'success' : 'danger'}>
              {STAGE_LABELS[deal.stage]}
            </Badge>
            <span className="text-body text-gray-700">
              {completed ? '딜이 완료되었습니다.' : '딜이 무산 처리되었습니다.'}
            </span>
            <span className="ml-auto text-caption tabular-nums text-gray-400">
              {enteredAt(logs, deal.stage) ?? ''}
            </span>
          </li>
        )}
      </ol>
    </Card>
  )
}
