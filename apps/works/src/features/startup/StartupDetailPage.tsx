import { BackButton, Badge, Banner, Button, CardShell, cardText, DensityProvider, InfoField, Spinner } from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DetailDeleteButton } from '@/components/DetailDeleteButton'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { ChangeHistoryPanel } from '@/features/networks/ChangeHistoryPanel'
import { RelatedMinutesPanel } from '@/features/office/minutes/RelatedMinutesPanel'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { useContributions, useDeactivateEntity, useEntity } from '@/features/master/entityHooks'
import { useAuthStore } from '@/auth/authStore'
import { StartupDetailForm } from '@/features/startup/StartupDetailForm'
import { StartupCapabilitySection } from '@/features/startup/StartupCapabilitySection'
import { StartupPerformanceSection } from '@/features/startup/StartupPerformanceSection'
import { useStartupManagers } from '@/features/startup/startupPoolHooks'
import {
  isInvested,
  managementStatusLabel,
  startupContentKey,
} from '@/features/startup/startupClassification'
import { SensitiveValue } from '@/features/master/SensitiveValue'
import { readBusiness } from '@/features/startup/startupProfile'
import { formatFounded, readIndustries } from '@/features/startup/startupGrowth'
import { SectionHeading } from '@/features/startup/SectionHeading'
import { StartupManagementSection } from '@/features/startup/StartupManagementSection'
import { StartupSummaryCards, readSummary } from '@/features/startup/StartupSummaryCards'

/** 첨부/피드백/기여 로그 대상 유형(다형 테이블 target_type). */
const RESOURCE_TYPE = 'startup'

/** 발굴기업 목록 경로(뒤로가기 목적지). */
const LIST_PATH = '/startup?scope=all'

/** 라벨: 값 한 줄 — 규격은 공용 `InfoField`가 소유한다. */
const Info = InfoField

/** 날짜 문자열의 앞 10자리(YYYY-MM-DD). 값이 없으면 null을 돌려 빈 값 표기를 InfoField에 맡긴다. */
function formatDate(v: unknown): string | null {
  const s = v ? String(v) : ''
  return s.length >= 10 ? s.slice(0, 10) : null
}

/** 원장 스칼라 값 → 문자열(빈 값은 null). 민감정보 컴포넌트에 넘길 때 쓴다. */
function text(v: unknown): string | null {
  return v == null || v === '' ? null : String(v)
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
  // 딜메이커 = 담당자 원장의 리드. 투자기업에만 지정되므로 그 외에는 빈 값으로 선다.
  const leadName = (managers ?? []).find((m) => m.is_lead)?.user?.name ?? null

  const str = (key: string) => {
    const v = record[key]
    return v == null || v === '' ? '-' : String(v)
  }
  // 민감정보 정책은 구분(관리현황)별 메뉴 단위다 — 상세도 자기가 속한 목록과 같은 정책을 따른다.
  const contentKey = startupContentKey(record.management_status)
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
                      분야 태그와 같은 page 밀도로 맞춰 헤더 칩끼리 크기가 어긋나지 않게 한다. */}
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

              {/* 기본 정보(3열): 대표자·이메일·연락처 / 회사형태·설립일·사업자등록번호 / 소재지·상세주소 / 수정일·생성자.
                  상태·분류(단계·구분·관리현황)는 헤더 칩으로 올려 이 그리드에서 뺐다.
                  상세주소는 길 수 있어 다음 행 전폭을 차지한다(소재지·수정일 뒤에서 자연스레 줄바꿈). */}
              <div className="mt-5 grid grid-cols-1 gap-2.5 border-t border-gray-100 pt-4 sm:grid-cols-3">
                {/* 대표자·이메일·연락처는 외부 기업 정보 — ADMIN '민감정보 관리'의 구분별 정책을 따른다. */}
                <Info
                  label="대표자"
                  value={
                    <SensitiveValue
                      field="name"
                      contentKey={contentKey}
                      value={text(record.representative)}
                      resourceType={RESOURCE_TYPE}
                      resourceId={record.id}
                    />
                  }
                />
                <Info
                  label="이메일"
                  value={
                    <SensitiveValue
                      field="email"
                      contentKey={contentKey}
                      value={text(record.email)}
                      resourceType={RESOURCE_TYPE}
                      resourceId={record.id}
                    />
                  }
                />
                <Info
                  label="연락처"
                  value={
                    <SensitiveValue
                      field="phone"
                      contentKey={contentKey}
                      value={text(record.phone)}
                      resourceType={RESOURCE_TYPE}
                      resourceId={record.id}
                    />
                  }
                />
                <Info label="회사 형태" value={str('company_form')} />
                <Info label="설립일" value={formatFounded(record.founded_on)} />
                <Info label="사업자등록번호" value={str('biz_reg_no')} />
                <Info label="소재지" value={str('location')} />
                {/* 상세주소는 길 수 있어 소재지 오른쪽 2열을 차지한다(이 그리드의 마지막 칸). */}
                <Info
                  label="상세주소"
                  value={str('address_detail')}
                  className="min-w-0 sm:col-span-2"
                  valueClassName="min-w-0 flex-1 truncate"
                />
              </div>

              {/* 발굴 경로는 길 수 있어 전체 폭을 쓰되, 표시 규격은 위 정보행(Info)과 동일하게 맞춘다. */}
              <div className="mt-2.5 border-t border-gray-100 pt-3">
                <Info label="발굴 경로" value={str('discovery_source')} />
              </div>

              {/* 이 레코드를 누가 맡고 누가 만들었는지 — 업무 사실(위 칸)과 다른 축이라 줄을 나눈다.
                  딜메이커만 도메인 값이고(관리 주체) 생성자·수정일은 레코드를 다룬 흔적이라
                  한 단 연한 메타 톤으로 물러난다. 담당자 전원은 아래 관리 현황 카드가 답한다. */}
              <div className="mt-2.5 grid grid-cols-1 gap-2.5 border-t border-gray-100 pt-3 sm:grid-cols-3">
                <Info label="딜메이커" value={leadName} />
                <Info label="생성자" value={record.creator?.name || null} meta />
                <Info label="수정일" value={formatDate(record.updated_at)} meta />
              </div>
            </CardShell>

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
