import { Badge, Banner, PageHeader, Spinner } from '@ynarcher/ui'
import { Link, useParams } from 'react-router-dom'
import { STAGE_LABELS, stageTone } from '@/features/mna/config'
import { DealInfoCard } from '@/features/mna/detail/DealInfoCard'
import { DealStageCard } from '@/features/mna/detail/DealStageCard'
import { DealTimelineCard } from '@/features/mna/detail/DealTimelineCard'
import { DocChecklistCard } from '@/features/mna/detail/DocChecklistCard'
import { useDeal, useStageLogs } from '@/features/mna/hooks'

/**
 * M&A 딜 상세: AC 프로그램 상세와 동일한 2컬럼 골격.
 * 좌측 = 작업 카드(진행 단계 스텝퍼 + 보안 문서 체크리스트),
 * 우측 = 단계 전환 타임라인 + 딜 정보. 각 카드는 자기 데이터를 독립 조회한다.
 */
export function MnaDealDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: deal, isLoading } = useDeal(id)
  const { data: logs } = useStageLogs(id)

  if (isLoading) return <Spinner />
  if (!deal || !id) return <Banner tone="warning">딜을 찾을 수 없습니다.</Banner>

  return (
    <div className="space-y-5">
      <PageHeader
        back={
          <Link to="/mna" className="text-caption font-semibold text-brand hover:text-brand-600">
            ← 딜 목록
          </Link>
        }
        title={deal.deal_name}
        titleExtra={
          <>
            <Badge tone={stageTone[deal.stage]}>{STAGE_LABELS[deal.stage]}</Badge>
            {deal.on_hold && <Badge tone="danger">보류</Badge>}
          </>
        }
        description={
          `${deal.target_name ?? '대상 미지정'} · ${
            deal.estimated_value != null
              ? `${(deal.estimated_value / 100_000_000).toLocaleString()}억`
              : '가액 미정'
          }`
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <DealStageCard deal={deal} logs={logs ?? []} />
          <DocChecklistCard dealId={id} />
        </div>
        <div className="space-y-4">
          <DealTimelineCard logs={logs ?? []} />
          <DealInfoCard deal={deal} />
        </div>
      </div>
    </div>
  )
}
