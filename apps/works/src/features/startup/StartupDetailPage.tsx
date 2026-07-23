import { BackButton, Badge, Banner, Button, CardShell, cardText, DensityProvider, InfoField, PanelCard, Spinner } from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DetailDeleteButton } from '@/components/DetailDeleteButton'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { ChangeHistoryPanel } from '@/features/networks/ChangeHistoryPanel'
import { RelatedMinutesPanel } from '@/features/office/minutes/RelatedMinutesPanel'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { useContributions, useDeactivateEntity, useEntity } from '@/features/networks/hooks'
import { useAuthStore } from '@/auth/authStore'
import { StartupDetailForm } from '@/features/startup/StartupDetailForm'
import { useStartupManagers } from '@/features/startup/startupPoolHooks'
import { isInvested, managementStatusLabel } from '@/features/startup/startupClassification'
import {
  StartupBusinessTeamCard,
  readBusiness,
  readTeam,
} from '@/features/startup/StartupBusinessTeamCard'
import { StartupGrowthSection } from '@/features/startup/StartupGrowthSection'
import { StartupBusinessTimeline } from '@/features/startup/StartupBusinessTimeline'
import { readBusinessStatus, readGrowth, formatFounded, readIndustries } from '@/features/startup/startupGrowth'
import { StartupShareholderCard } from '@/features/startup/StartupShareholderCard'
import { readShareholderHistory } from '@/features/startup/startupShareholders'
import { STARTUP_MATERIAL_SECTIONS } from '@/features/startup/startupMaterials'
import { SectionHeading } from '@/features/startup/SectionHeading'
import { PlaceholderCard } from '@/features/startup/PlaceholderCard'
import { StartupMediaCard } from '@/features/startup/StartupMediaCard'
import { readMedia } from '@/features/startup/startupMedia'
import { StartupComparePanel } from '@/features/startup/StartupComparePanel'

/** 첨부/피드백/기여 로그 대상 유형(다형 테이블 target_type). */
const RESOURCE_TYPE = 'startup'

/** 발굴기업 목록 경로(뒤로가기 목적지). */
const LIST_PATH = '/startup?tab=discovered'

/** 관리 현황 카드 섹션(플랫폼 전반 참여·관리 이력). 현재는 헤드라인만, 내용은 후속 구현.
 *  회의록은 실제 연동 패널(우측 RelatedMinutesPanel)로 구현되어 이 placeholder 목록에서 뺐다. */
const ACTIVITY_SECTIONS = ['참여 사업', '참여 M&A', '참여 프로젝트', 'A-STREAM', '기업 진단', '멘토링 & 컨설팅']

/** 라벨: 값 한 줄 — 규격은 공용 `InfoField`가 소유한다. */
const Info = InfoField

function formatDate(v: unknown): string {
  const s = v ? String(v) : ''
  return s.length >= 10 ? s.slice(0, 10) : '-'
}

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

  const str = (key: string) => {
    const v = record[key]
    return v == null || v === '' ? '-' : String(v)
  }
  const logo = record.logo_url ? String(record.logo_url) : null
  const industries = readIndustries(record)
  // 부제 자리에는 한 줄 소개(business_profile.oneLiner)를 노출한다.
  const oneLiner = readBusiness(record).oneLiner ?? ''

  return (
    <div className="space-y-5">
      {/* 편집 중에는 폼(FormTopBar)이 상단 바를 소유한다 — 뒤로가기 옆 우측 자리를 취소·확정이 쓴다. */}
      {!editing && (
        <div className="flex items-center justify-between">
          <BackButton as={Link} to={LIST_PATH} />
          {canEdit ? (
            <div className="flex items-center gap-2">
              <DetailDeleteButton
                name={record.name ? String(record.name) : undefined}
                onDelete={(reason) => deactivate.mutateAsync({ id: record.id, reason: reason ?? '' })}
                onDeleted={() => navigate(LIST_PATH)}
              />
              <Button onClick={() => setEditing(true)}>수정</Button>
            </div>
          ) : (
            <span className="text-caption text-gray-600">지정 담당자만 수정할 수 있습니다.</span>
          )}
        </div>
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
            <CardShell>
              <div className="flex items-center gap-5">
                <PhotoBox src={logo} />
                <div className="min-w-0 flex-1">
                  {/* 상세 헤더는 카드 안에 있어도 페이지 맥락이다. card 밀도를 그대로 두면 24px 제목 옆
                      배지가 11px(tag-card)로 찍혀 먼지처럼 보인다. */}
                  <DensityProvider value="page">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-title-md font-bold text-gray-900">{record.name}</h1>
                      {industries.map((ind) => (
                        <Badge key={ind} tone="neutral">
                          {ind}
                        </Badge>
                      ))}
                    </div>
                  </DensityProvider>
                  <p className={`mt-1 ${cardText.subtitle}`}>{oneLiner || '-'}</p>
                  {/* 상태·분류 칩: 라벨 없이 값만으로 읽히는 정보(단계·구분·관리현황)는 배지로 올린다.
                      톤은 축을 나눈다 — 단계=중립(사실), 구분=info(주 분류), 관리현황=success+점(라이브 상태).
                      산업 태그와 같은 page 밀도로 맞춰 헤더 칩끼리 크기가 어긋나지 않게 한다. */}
                  <DensityProvider value="page">
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {str('stage') !== '-' && <Badge tone="neutral">{str('stage')}</Badge>}
                      {managementStatusLabel(record.management_status) && (
                        <Badge tone={invested ? 'info' : 'neutral'}>
                          {managementStatusLabel(record.management_status)}
                        </Badge>
                      )}
                      {invested && str('pool_status') !== '-' && (
                        <Badge tone="success" dot>
                          {str('pool_status')}
                        </Badge>
                      )}
                    </div>
                  </DensityProvider>
                </div>
              </div>

              {/* 기본 정보(3열): 대표자·이메일·연락처 / 회사형태·설립일·사업자등록번호 / 소재지·수정일.
                  상태·분류(단계·구분·관리현황)는 헤더 칩으로 올려 이 그리드에서 뺐다.
                  상세주소는 길 수 있어 다음 행 전폭을 차지한다(소재지·수정일 뒤에서 자연스레 줄바꿈). */}
              <div className="mt-5 grid grid-cols-1 gap-2.5 border-t border-gray-100 pt-4 sm:grid-cols-3">
                <Info label="대표자" value={str('representative')} />
                <Info label="이메일" value={str('email')} />
                <Info label="연락처" value={str('phone')} />
                <Info label="회사 형태" value={str('company_form')} />
                <Info label="설립일" value={formatFounded(record.founded_on)} />
                <Info label="사업자등록번호" value={str('biz_reg_no')} />
                <Info label="소재지" value={str('location')} />
                {/* 상세주소는 소재지 오른쪽(설립일 아래) 2열을 차지하고, 수정일은 다음 행으로 흐른다. */}
                <Info
                  label="상세주소"
                  value={str('address_detail')}
                  className="min-w-0 sm:col-span-2"
                  valueClassName="min-w-0 flex-1 truncate"
                />
                <Info label="수정일" value={formatDate(record.updated_at)} />
              </div>

              {/* 발굴 경로는 길 수 있어 전체 폭을 쓰되, 표시 규격은 위 정보행(Info)과 동일하게 맞춘다. */}
              <div className="mt-2.5 border-t border-gray-100 pt-3">
                <Info label="발굴 경로" value={str('discovery_source')} />
              </div>
            </CardShell>

            {/* 기업 개요 구분선(기본 데이터 아래) */}
            <SectionHeading title="기업 개요" />

            {/* 기업 개요 첫 카드: 비즈니스 & 팀 역량. 카드 우상단 '수정'으로 편집. */}
            <StartupBusinessTeamCard business={readBusiness(record)} team={readTeam(record)} />

            {/* 주주 구성(기업 개요 첫 카드 아래): 변경 시점별 이력형(최신 표+도넛 + 과거 이력 모달). 편집은 통합 수정에서. */}
            <StartupShareholderCard history={readShareholderHistory(record)} />

            {/* 성장 지표(별도 그룹): 재무/매출/고용/투자 표 + 차트. 편집은 통합 수정에서. */}
            <StartupGrowthSection growth={readGrowth(record)} startupId={record.id} />

            {/* 연혁(성장 지표 아래). 편집은 통합 수정에서. */}
            <StartupBusinessTimeline businessStatus={readBusinessStatus(record)} />

            {/* 미디어(관리 현황보다 위): 언론기사·영상 등 URL + OG 메타데이터. 편집·URL 첨부는 통합 수정에서. */}
            <SectionHeading title="미디어" />
            <StartupMediaCard media={readMedia(record)} />

            {/* 관리 현황: 담당자(최상단) + 플랫폼 전반 참여·관리 이력(현재는 헤드라인만, 내용은 후속) */}
            <SectionHeading title="관리 현황" />
            {/* 담당자 카드(관리 현황 최상단). 담당자와 작성자(등록자)는 별개 축이므로 항상 분리 표기한다.
                투자기업만 지정 담당자(리드/지원)를 가지며, 비투자는 공동관리(특정 담당자 없음)다. */}
            <PanelCard title="담당자">
              {invested ? (
                (managers ?? []).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(managers ?? []).map((m) => (
                      <Badge key={m.user_id} tone={m.is_lead ? 'success' : 'neutral'}>
                        {(m.user?.name ?? '-') + (m.is_lead ? ' (리드)' : '')}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-body text-gray-600">지정된 담당자가 없습니다.</p>
                )
              ) : (
                <p className="text-body text-gray-600">
                  공동관리 — NETWORKS 쓰기 권한자 누구나 수정할 수 있습니다.
                </p>
              )}
              {/* 등록자: 담당자와 무관한 최초 등록 감사 정보. 항상 표시한다.
                  표시 규격은 위 기본 데이터 카드의 정보행과 동일하게 Info에 맡긴다. */}
              <div className="mt-3 border-t border-gray-100 pt-3">
                <Info label="등록자" value={record.creator?.name || '-'} />
              </div>
            </PanelCard>
            {/* 관리 현황 로그 카드: 기능은 후속 구현, 지금은 건수 뱃지(0) 디자인만 잡아둔다. */}
            {ACTIVITY_SECTIONS.map((title) => (
              <PlaceholderCard key={title} title={title} count={0} />
            ))}
          </div>

          {/* 우측(1/3): 자료(IR·재무제표·기타) → 피드백 → 변동 이력 → 기업 비교(좌우 비교 카드) */}
          <div className="space-y-4 lg:col-span-1">
            {STARTUP_MATERIAL_SECTIONS.map((s) => (
              <MaterialPanel key={s.type} targetType={s.type} targetId={record.id} title={s.title} readOnly />
            ))}
            <RelatedMinutesPanel targetType="startup" targetId={record.id} />
            <FeedbackPanel targetType={RESOURCE_TYPE} targetId={record.id} />
            <ChangeHistoryPanel contributions={contributions} />
            {/* 벤치마크: 동종기업 대비 지표 좌우 비교 카드 */}
            <SectionHeading title="벤치마크" />
            <StartupComparePanel record={record} />
          </div>
        </div>
      )}
    </div>
  )
}
