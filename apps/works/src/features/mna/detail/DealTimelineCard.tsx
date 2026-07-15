import { Badge, Card } from '@ynarcher/ui'
import { STAGE_LABELS } from '@/features/mna/config'
import type { StageLog } from '@/features/mna/hooks'

/** 단계 전환 타임라인(상세 우측 카드). DB 트리거가 기록한 전환 이력을 최신순으로 보여준다. */
export function DealTimelineCard({ logs }: { logs: StageLog[] }) {
  return (
    <Card
      title="단계 전환 타임라인"
      actions={<Badge tone="neutral">{logs.length}건</Badge>}
    >
      <div className="rounded-radius-md border border-gray-300 bg-white">
        {logs.map((l) => (
          <div
            key={l.id}
            className="flex items-center gap-2 border-b border-gray-100 px-4 py-2 text-body last:border-b-0"
          >
            <span className="text-caption tabular-nums text-gray-400">
              {new Date(l.created_at).toLocaleDateString('ko-KR')}
            </span>
            <span className="text-gray-600">
              {l.from_stage ? STAGE_LABELS[l.from_stage] : '생성'} →{' '}
              <span className="font-medium text-gray-900">
                {STAGE_LABELS[l.to_stage]}
              </span>
            </span>
          </div>
        ))}
        {logs.length === 0 && (
          <p className="px-4 py-6 text-center text-caption text-gray-400">
            단계 전환 이력이 없습니다.
          </p>
        )}
      </div>
    </Card>
  )
}
