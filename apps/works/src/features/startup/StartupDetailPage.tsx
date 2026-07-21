import { BackButton, Badge, Banner, Button, CardShell, PanelCard, Spinner } from '@ynarcher/ui'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { ChangeHistoryPanel } from '@/features/networks/ChangeHistoryPanel'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { useContributions, useEntity } from '@/features/networks/hooks'
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

/** 관리 현황 카드 섹션(플랫폼 전반 참여·관리 이력). 현재는 헤드라인만, 내용은 후속 구현. */
const ACTIVITY_SECTIONS = ['참여 사업', '참여 M&A', '참여 프로젝트', 'A-STREAM', '기업 진단', '멘토링 & 컨설팅', '회의록']

/**
 * 라벨: 값 한 줄. `className`으로 그리드 스팬 등을, `valueClassName`으로 값 표시(말줄임 등)를 지정한다.
 *
 * 라벨과 값은 크기를 `text-body` 하나로 통일하고 위계는 색으로만 만든다. 한 줄 안에서 크기가
 * 갈리면 2px 차이도 '작은 글씨'가 아니라 다른 폰트로 읽혀, 정작 색으로 줘야 할 위계를 크기가
 * 가져가 버린다. 근거: densityScale.ts `tableText` — "크기는 하나, 구분은 굵기와 색으로만".
 */
function Info({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string
  value: ReactNode
  className?: string
  valueClassName?: string
}) {
  return (
    <div className={`flex items-baseline gap-2${className ? ` ${className}` : ''}`}>
      <span className="shrink-0 text-body text-gray-500">{label}:</span>
      <span
        className={`text-body text-gray-900${valueClassName ? ` ${valueClassName}` : ''}`}
        title={typeof value === 'string' ? value : undefined}
      >
        {value ?? '-'}
      </span>
    </div>
  )
}

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
  const { data: record, isLoading } = useEntity('startups', id)
  const { data: contributions } = useContributions('startups', id)
  const { data: managers } = useStartupManagers(id)
  const authUser = useAuthStore((s) => s.user)
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
      <div className="flex items-center justify-between">
        <BackButton as={Link} to="/startup?tab=discovered" />
        {!editing && canEdit && <Button onClick={() => setEditing(true)}>수정</Button>}
        {!editing && !canEdit && (
          <span className="text-caption text-gray-600">지정 담당자만 수정할 수 있습니다.</span>
        )}
      </div>

      {editing ? (
        <StartupDetailForm
          recordId={record.id}
          initial={record}
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
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-title-md font-bold text-gray-900">{record.name}</h1>
                    {industries.map((ind) => (
                      <Badge key={ind} tone="neutral">
                        {ind}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-1 text-body text-gray-700">{oneLiner || '-'}</p>
                </div>
              </div>

              {/* 정보 그리드(3열): 단계·구분·현황 / 대표자·이메일·연락처 / 사업자등록번호·수정일 */}
              <div className="mt-5 grid grid-cols-1 gap-2.5 border-t border-gray-100 pt-4 sm:grid-cols-3">
                <Info label="단계" value={str('stage')} />
                <Info label="구분" value={managementStatusLabel(record.management_status) ?? '-'} />
                {invested && <Info label="관리현황" value={str('pool_status')} />}
                <Info label="대표자" value={str('representative')} />
                <Info label="이메일" value={str('email')} />
                <Info label="연락처" value={str('phone')} />
                <Info label="회사 형태" value={str('company_form')} />
                <Info label="설립일" value={formatFounded(record.founded_on)} />
                <Info label="사업자등록번호" value={str('biz_reg_no')} />
                {/* 소재지 옆 상세주소는 길 수 있어 나머지 2열을 차지하고, 수정일은 소재지 아래로 흐른다. */}
                <Info label="소재지" value={str('location')} />
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
            <StartupGrowthSection growth={readGrowth(record)} />

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
                <p className="text-body text-gray-700">
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
