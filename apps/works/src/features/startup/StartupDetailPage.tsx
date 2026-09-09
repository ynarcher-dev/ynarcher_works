import { BackButton, Banner, Button, DetailTopBar, formText, Spinner } from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DetailDeleteButton } from '@/components/DetailDeleteButton'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { ChangeHistoryPanel } from '@/features/networks/ChangeHistoryPanel'
import { RelatedMinutesPanel } from '@/features/office/minutes/RelatedMinutesPanel'
import { useContributions, useDeactivateEntity, useEntity } from '@/features/master/entityHooks'
import { useAuthStore } from '@/auth/authStore'
import { StartupDetailForm } from '@/features/startup/StartupDetailForm'
import { StartupCapabilitySection } from '@/features/startup/StartupCapabilitySection'
import { StartupPerformanceSection } from '@/features/startup/StartupPerformanceSection'
import { useStartupManagers } from '@/features/startup/startupPoolHooks'
import { isInvested, startupContentKey } from '@/features/startup/startupClassification'
import { SectionHeading } from '@/components/SectionHeading'
import { StartupManagementSection } from '@/features/startup/StartupManagementSection'
import { StartupSummaryCards, readSummary } from '@/features/startup/StartupSummaryCards'
import { StartupHeaderCard } from '@/features/startup/StartupHeaderCard'

/** 첨부/피드백/기여 로그 대상 유형(다형 테이블 target_type). */
const RESOURCE_TYPE = 'startup'

/** 발굴기업 목록 경로(뒤로가기 목적지). */
const LIST_PATH = '/startup'

/**
 * 스타트업 풀 상세페이지(모달 아님, NETWORKS와 동일한 카드 섹션 + 좌우 배치).
 * 좌측: '기본 데이터' 카드(사진 + 이름/배지 + 부제 + 연락처·이메일 정보행) — NETWORKS 헤더 구성과 동일.
 * 우측: 공용 패널(자료 관리·피드백·변동 이력). '수정'에서 사진 입력 포함 편집한다.
 */
export function StartupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: record, isLoading } = useEntity('startups', id)
  const { data: contributions } = useContributions('startups', id)
  const { data: managers } = useStartupManagers(id)
  const authUser = useAuthStore((s) => s.user)
  const deactivate = useDeactivateEntity('startups')
  const [editing, setEditing] = useState(false)

  if (isLoading) return <Spinner />
  if (!record) return <Banner tone="warning">스타트업 정보를 찾을 수 없습니다.</Banner>

  // 투자기업은 지정 담당자 또는 관리자만 수정 가능(서버 RLS가 최종 강제, 여기선 UI 게이팅).
  const invested = isInvested(record.management_status)
  const isAdmin = authUser?.role === 'super_admin'
  const isManager = (managers ?? []).some((m) => m.user_id === authUser?.id)
  const canEdit = !invested || isAdmin || isManager
  // 딜메이커 = 담당자 원장의 리드. 투자기업에만 지정되므로 그 외에는 빈 값으로 선다.
  const leadName = (managers ?? []).find((m) => m.is_lead)?.user?.name ?? null

  // 민감정보 정책은 구분(관리현황)별 메뉴 단위다 — 상세도 자기가 속한 목록과 같은 정책을 따른다.
  const contentKey = startupContentKey(record.management_status)

  return (
    <div className="space-y-5">
      {/* 편집 중에는 폼(FormTopBar)이 상단 바를 소유한다 — 뒤로가기 옆 우측 자리를 취소·확정이 쓴다. */}
      {!editing && (
        <DetailTopBar
          back={<BackButton as={Link} to={LIST_PATH} />}
          actions={
            canEdit ? (
              <>
                <DetailDeleteButton
                  name={record.name ? String(record.name) : undefined}
                  onDelete={(reason) => deactivate.mutateAsync({ id: record.id, reason: reason ?? '' })}
                  onDeleted={() => navigate(LIST_PATH)}
                />
                <Button onClick={() => setEditing(true)}>수정</Button>
              </>
            ) : (
              <span className={formText.hint}>지정 담당자만 수정할 수 있습니다.</span>
            )
          }
        />
      )}

      {editing ? (
        <StartupDetailForm
          recordId={record.id}
          initial={record}
          backTo={LIST_PATH}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* 좌측(2/3): 기본 데이터 카드 — 사진 + 이름/배지 + 부제 + 정보행 */}
          <div className="space-y-4 lg:col-span-2">
            {/* 카드 규격(사진·제목·배지·부제·칩 줄·구분선·정보행)은 화면이 아니라 공용
                `EntityHeaderCard`가 소유한다 — 상세 헤더가 페이지 맥락이라는 규칙(24px 제목 옆
                배지가 카드 규격 11px로 찍히지 않게 하는 것)도 그 카드가 함께 갖는다. */}
            <StartupHeaderCard record={record} contentKey={contentKey} leadName={leadName} />

            {/* 요약 구분선(기본 데이터 아래). 기업 개요보다 위에 서는 이유는 성격이 달라서다 —
                아래 개요가 사실을 나열하는 자리라면 여기는 그 사실을 읽은 담당자의 판단이고,
                판단이 근거보다 먼저 와야 아래를 무엇을 찾으며 읽을지가 정해진다. */}
            <SectionHeading title="요약" />

            {/* 요약 3축(강점 · 보완점 · 필요사항). 편집은 통합 수정에서. */}
            <StartupSummaryCards summary={readSummary(record)} />

            {/* 역량 밴드: 다시 재지 않는 값(비즈니스·제품기술·팀조직·지식재산).
                편집은 상단 '수정'(통합 수정 폼)에서. */}
            <StartupCapabilitySection record={record} />

            {/* 실적 밴드: 기간마다 다시 재는 값(연혁 → 트랙션·고객 → 매출·재무 → 고용·주주 →
                투자 → 미디어). 두 밴드를 가르는 기준은 날짜의 유무가 아니라 '다시 재는가'다. */}
            <StartupPerformanceSection record={record} />

            {/* 관리 현황: 담당자(최상단) + 사업 원장 3종 참여 목록 */}
            <StartupManagementSection
              startupId={record.id}
              invested={invested}
              managers={managers ?? []}
            />
          </div>

          {/* 우측(1/3): 자료 관리 → 관련 회의록 → 변동 이력 → 코멘트.
              공용 순서에서 전자결재만 빠진다 — 스타트업은 결재를 올리는 단위가 아니라 사업이
              결재를 올리는 대상이라, 여기에 빈 결재 상자를 두면 없는 흐름을 있는 것처럼 보인다.
              비교군 진입점 카드는 목록 화면으로 책임을 모아두기 위해 걷어냈다. */}
          <div className="space-y-4 lg:col-span-1">
            {/* 조회는 읽기만 한다 — 값을 바꾸기 시작하는 일('AI 작성하기' 포함)은 전부
                편집 폼 안에 있다. 여기에 두면 화면이 말하는 것과 하는 일이 어긋난다. */}
            <MaterialPanel targetType={RESOURCE_TYPE} targetId={record.id} readOnly />
            <RelatedMinutesPanel targetType="startup" targetId={record.id} />
            <ChangeHistoryPanel contributions={contributions} />
            <FeedbackPanel targetType={RESOURCE_TYPE} targetId={record.id} />
          </div>
        </div>
      )}
    </div>
  )
}
