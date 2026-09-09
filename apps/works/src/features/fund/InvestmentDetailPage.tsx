import { BackButton, Banner, DetailTopBar, Spinner, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FUND_PORTFOLIO_CONTENT_KEY } from '@/features/admin/sensitiveContents'
import { ChangeHistoryPanel } from '@/features/networks/ChangeHistoryPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { RelatedMinutesPanel } from '@/features/office/minutes/RelatedMinutesPanel'
import { useContributions, useEntity } from '@/features/master/entityHooks'
import { InvestmentFormModal } from '@/features/fund/InvestmentFormModal'
import { InvestmentSummaryCards } from '@/features/fund/InvestmentSummaryCards'
import { useDeleteInvestment, useFund, useFundPurposes, useInvestments } from '@/features/fund/hooks'
import { SectionHeading } from '@/components/SectionHeading'
import { StartupCapabilitySection } from '@/features/startup/StartupCapabilitySection'
import { StartupHeaderCard } from '@/features/startup/StartupHeaderCard'
import { StartupManagementSection } from '@/features/startup/StartupManagementSection'
import { StartupPerformanceSection } from '@/features/startup/StartupPerformanceSection'
import { StartupSummaryCards, readSummary } from '@/features/startup/StartupSummaryCards'
import { useStartupManagers } from '@/features/startup/startupPoolHooks'
import { isInvested } from '@/features/startup/startupClassification'

/** 기업 자료·회의록·기여 로그의 다형 키. 이 페이지가 세우는 것은 STARTUP 원장의 것이다. */
const RESOURCE_TYPE = 'startup'

/**
 * 투자 집행 상세 페이지(모달 아님). 포트폴리오 표의 행을 누르면 여기로 온다.
 *
 * **한 페이지에 원장 둘이 선다.** 머리 카드는 `investments`(이 건의 조건·규약 목적·딜메이커)이고,
 * 그 아래는 STARTUP 상세와 **같은 구성**의 기업 정보(`startups`)다. 기업 쪽을 여기서 다시
 * 짜지 않고 그 화면의 부품을 그대로 세우는 이유는 하나다 — 복사하면 카드 구성이 두 벌이 되고
 * 한쪽에 카드를 더하는 날 다른 쪽만 옛 구성으로 남아, 같은 기업을 두 화면에서 보는 눈이 매번
 * 자리를 다시 찾게 된다.
 *
 * **고치는 자리는 소유한 원장이 정한다.** '수정'은 투자 집행 카드에 붙어 이 건만 고치고(모달),
 * 기업 값은 전부 읽기 전용이다 — 여기서 기업까지 고칠 수 있게 하면 같은 값을 두 화면에서
 * 저장하게 되고, 어느 쪽이 마지막인지 답할 근거가 없다. 기업을 고치는 자리는 STARTUP 상세다.
 *
 * **삭제는 여기 없다.** 되돌릴 수 없는 일이라 입구를 늘리지 않고 수정 모달 좌측 하단 하나로
 * 두며, 지운 뒤에는 이 페이지의 주인공이 사라지므로 펀드 상세(포트폴리오 탭)로 돌려보낸다.
 */
export function InvestmentDetailPage() {
  const { fundId, investmentId } = useParams<{ fundId: string; investmentId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: fund } = useFund(fundId)
  const { data: investments, isLoading } = useInvestments(fundId)
  const { data: purposes } = useFundPurposes(fundId)
  const inv = (investments ?? []).find((i) => i.id === investmentId) ?? null
  // 기업 정보는 조인값이 아니라 원장에서 직접 읽는다 — 아래 밴드들이 원장 행 하나를 통째로 받는다.
  const startupId = inv?.startup_id ?? undefined
  const { data: record } = useEntity('startups', startupId)
  const { data: contributions } = useContributions('startups', startupId)
  const { data: managers } = useStartupManagers(startupId)
  const del = useDeleteInvestment(fundId ?? '')
  const [editing, setEditing] = useState(false)

  const fundPath = `/fund/${fundId}`

  if (isLoading) return <Spinner />
  if (!inv || !fundId) return <Banner tone="warning">투자 집행 건을 찾을 수 없습니다.</Banner>

  const onDelete = async () => {
    // 되돌릴 수 없는 일이라 한 번 되묻는다(모달의 삭제 버튼은 확인을 갖지 않는다).
    if (!window.confirm(`${inv.startup_name ?? '해당'} 투자를 삭제할까요?`)) return
    try {
      await del.mutateAsync(inv.id)
      toast.show('투자를 삭제했습니다.', 'success')
      navigate(fundPath)
    } catch {
      toast.show('삭제에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  // 딜메이커 = 담당자 원장의 리드. 기업 헤더 카드가 관리 주체로 세운다.
  const leadName = (managers ?? []).find((m) => m.is_lead)?.user?.name ?? null

  return (
    <div className="space-y-5">
      <DetailTopBar back={<BackButton as={Link} to={fundPath} />} />

      <InvestmentSummaryCards
        investment={inv}
        fundName={fund?.name ?? '-'}
        purposes={purposes ?? []}
        onEdit={() => setEditing(true)}
      />

      {!record ? (
        // 기업 원장을 못 읽는 경우(STARTUP 열람 권한 없음·병합/비활성 등)에도 위 두 카드는 선다 —
        // 이 페이지가 답해야 하는 것은 먼저 '이 집행 건'이고, 기업 정보는 그 다음이다.
        <Banner tone="info">기업 정보를 불러오지 못했습니다. STARTUP 열람 권한을 확인하세요.</Banner>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {/* 민감정보 정책은 '어느 목록의 상세인가'가 정한다 — 이 화면은 FUND 포트폴리오다. */}
            <StartupHeaderCard
              record={record}
              contentKey={FUND_PORTFOLIO_CONTENT_KEY}
              leadName={leadName}
            />

            <SectionHeading title="요약" />
            <StartupSummaryCards summary={readSummary(record)} />
            <StartupCapabilitySection record={record} />
            <StartupPerformanceSection record={record} />
            <StartupManagementSection
              startupId={record.id}
              invested={isInvested(record.management_status)}
              managers={managers ?? []}
            />
          </div>

          <div className="space-y-4 lg:col-span-1">
            <MaterialPanel targetType={RESOURCE_TYPE} targetId={record.id} readOnly />
            <RelatedMinutesPanel targetType="startup" targetId={record.id} />
            <ChangeHistoryPanel contributions={contributions} />
            <FeedbackPanel targetType={RESOURCE_TYPE} targetId={record.id} />
          </div>
        </div>
      )}

      <InvestmentFormModal
        fundId={fundId}
        fundName={fund?.name ?? ''}
        open={editing}
        editing={inv}
        onClose={() => setEditing(false)}
        onDelete={() => void onDelete()}
      />
    </div>
  )
}
