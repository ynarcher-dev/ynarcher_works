import { BackButton, Badge, Banner, Button, CardShell, cardText, DensityProvider, InfoField, PanelCard, Spinner } from '@ynarcher/ui'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { maskEmail, maskPhone } from '@/lib/mask'
import { useSensitiveStore } from '@/features/admin/sensitiveStore'
import { EmployeeForm } from '@/features/management/EmployeeForm'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { CareerView, hasCareerRows } from '@/features/networks/CareerView'
import { SectionHeading } from '@/features/startup/SectionHeading'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { ChangeHistoryPanel } from '@/features/networks/ChangeHistoryPanel'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import { MiniPager, usePaged } from '@/features/networks/MiniPager'
import { ROLE_LABELS } from '@/features/management/config'
import { useDepartments, useEmployee } from '@/features/management/hooks'

/**
 * 임직원과 상호 연결될 관계형 도메인 카드 목록(추후 개발 데이터와 연동).
 * 수정 모드에서 직접 입력하지 않고, 각 도메인이 연동되면 자동으로 기록되는 읽기 전용 이력이다.
 */
const RELATION_SECTIONS = [
  '관리기업',
  '운영사업',
  'M&A',
  '프로젝트',
  '펀드(관리)',
  '펀드(운용)',
] as const

/** 상세 카드 섹션 래퍼. 헤더 규격은 공용 `PanelCard`가 소유한다. */
function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return <PanelCard title={title}>{children}</PanelCard>
}

/** 라벨: 값 한 줄 — 규격은 공용 `InfoField`가 소유한다. */
const Info = InfoField

function formatDate(v: string | null): string {
  return v && v.length >= 10 ? v.slice(0, 10) : '-'
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * 관계형 연동 도메인 카드(읽기 전용). 우측 패널과 동일한 미니 페이저를 갖춘 목록 골격이다.
 * 현재는 연동 데이터가 없어 빈 상태만 노출하며, 각 도메인 연동 시 연결 레코드가 자동 채워진다.
 */
function RelationCard({ title }: { title: string }) {
  // 추후 관계형 연동 시 연결된 레코드로 대체된다. 지금은 빈 목록.
  const items: ReactNode[] = []
  const { pageItems, page, setPage, pageCount } = usePaged(items)
  return (
    <DetailPanelCard title={title} count={items.length}>
      {items.length > 0 ? (
        <>
          <ul className="space-y-2 text-body text-gray-800">
            {pageItems.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
          <MiniPager page={page} pageCount={pageCount} onPage={setPage} />
        </>
      ) : (
        <p className="text-body text-gray-600">연동된 {title} 정보가 없습니다.</p>
      )}
    </DetailPanelCard>
  )
}

/**
 * 임직원 상세페이지(조회 전용). 전문가 상세 레이아웃을 따르되 멘토링 만족도·매칭·전문분야는 제외한다.
 * 사진·약력·노트는 NETWORKS 상세와 동일한 규격(profile.photo / profile.background / profile.note)으로 표시한다.
 * 우측 자료 관리·피드백 패널은 다형(target_type/target_id) 공용 패널을 재사용한다.
 * OFFICE(임직원 정보)에서 진입할 때는 readOnly로 수정 버튼을 숨기고 조회만 제공한다.
 */
interface EmployeeDetailPageProps {
  /** 조회 전용(OFFICE 진입): 수정 버튼/편집 모드를 제공하지 않는다. */
  readOnly?: boolean
  /** 뒤로가기 경로. 기본은 인사 관리 리스트. */
  backTo?: string
}

export function EmployeeDetailPage({
  readOnly = false,
  backTo = '/management?tab=hr',
}: EmployeeDetailPageProps = {}) {
  const { id } = useParams<{ id: string }>()
  const show = useSensitiveStore((s) => s.show)
  const [editing, setEditing] = useState(false)
  const { data: emp, isLoading } = useEmployee(id)
  const { data: depts } = useDepartments()

  if (isLoading) return <Spinner />
  if (!emp) return <Banner tone="warning">임직원 정보를 찾을 수 없습니다.</Banner>

  // 부서/팀 파생: 소속→루트 경로에서 인사 미노출(hr_hidden) 부서를 제외하고, 가장 구체적인
  // 2개(상위=부서·하위=팀)를 취한다. 노출 부서가 1개면 그것을 부서로만 표기.
  const byId: Record<string, { name: string; parent_id: string | null; hidden: boolean }> = {}
  for (const d of depts ?? []) byId[d.id] = { name: d.name, parent_id: d.parent_id, hidden: d.hr_hidden }
  const chain: string[] = []
  for (let cur = emp.department_id ?? null; cur && byId[cur]; cur = byId[cur]!.parent_id) {
    if (!byId[cur]!.hidden) chain.push(byId[cur]!.name)
  }
  const teamName = chain.length > 1 ? chain[0]! : ''
  const deptName = chain.length > 1 ? chain[1]! : chain[0] ?? ''
  const subtitle = [deptName, teamName].filter(Boolean).join(' · ') || '-'

  const profile = emp.profile ?? {}
  const company = str(profile.company)
  const position = str(profile.position)
  const rank = str(profile.rank)
  const payStep = str(profile.pay_step)
  const hireDate = str(profile.hire_date)
  const photo = str(profile.photo)
  // 약력은 구조화(background)가 정본이고, 구조 편집기 도입 전에 쌓인 자유 텍스트(bio)는 폴백으로만 노출한다.
  const hasCareer = hasCareerRows(profile.background)
  const legacyBio = str(profile.bio)
  const note = str(profile.note)
  // 이름 옆 배지는 관리자(super_admin)만 표기한다 — 나머지 역할은 부서·직책으로 이미 드러난다.
  const adminLabel = emp.user_type === 'super_admin' ? ROLE_LABELS[emp.user_type] : ''
  const email = show.email ? emp.email ?? '-' : maskEmail(emp.email ?? null)
  const phone = show.phone ? emp.phone ?? '-' : maskPhone(emp.phone ?? null)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <BackButton as={Link} to={backTo} />
        {!readOnly && !editing && <Button onClick={() => setEditing(true)}>수정</Button>}
      </div>

      {editing ? (
        <>
          <h1 className="text-title-md font-bold text-gray-900">임직원 수정</h1>
          <EmployeeForm
            recordId={emp.id}
            initial={emp}
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* 좌측(2/3): 프로필 본문 */}
          <div className="space-y-4 lg:col-span-2">
            <CardShell>
              <div className="flex items-center gap-5">
                <PhotoBox src={photo || null} />
                <div className="min-w-0 flex-1">
                  {/* 상세 헤더는 카드 안에 있어도 페이지 맥락이다 — 24px 제목 옆 배지가 11px로 찍히지 않게 한다. */}
                  <DensityProvider value="page">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-title-md font-bold text-gray-900">{emp.name}</h1>
                      {adminLabel && <Badge tone="neutral">{adminLabel}</Badge>}
                    </div>
                  </DensityProvider>
                  <p className={`mt-1 ${cardText.subtitle}`}>{subtitle}</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-2.5 border-t border-gray-100 pt-4 sm:grid-cols-3">
                <Info label="회사" value={company || '-'} />
                <Info label="직책" value={position || '-'} />
                <Info label="직급" value={rank || '-'} />
                <Info label="호봉" value={payStep || '-'} />
                <Info label="입사일" value={hireDate || '-'} />
                <Info label="연락처" value={phone} />
                <Info label="이메일" value={email} />
                <Info label="수정일" value={formatDate(emp.updated_at)} />
              </div>
            </CardShell>

            <SectionCard title="약력">
              {hasCareer ? (
                <CareerView value={profile.background} />
              ) : legacyBio ? (
                <p className="whitespace-pre-wrap text-body text-gray-800">{legacyBio}</p>
              ) : (
                <p className="text-body text-gray-600">
                  등록된 약력이 없습니다. "수정"에서 입력하세요.
                </p>
              )}
            </SectionCard>

            <SectionCard title="노트">
              {note ? (
                <p className="whitespace-pre-wrap text-body text-gray-800">{note}</p>
              ) : (
                <p className="text-body text-gray-600">등록된 노트 내용이 없습니다.</p>
              )}
            </SectionCard>

            {/* 관계형 연동 도메인(읽기 전용, 연동 시 자동 기록). 프로필 본문과 구분선으로 가른다. */}
            <SectionHeading title="활동 이력" />
            {RELATION_SECTIONS.map((title) => (
              <RelationCard key={title} title={title} />
            ))}
          </div>

          {/* 우측(1/3): 자료 관리 · 피드백 · 변동 이력(공용 패널 재사용). */}
          <div className="space-y-4 lg:col-span-1">
            <MaterialPanel targetType="employee" targetId={emp.id} />
            <FeedbackPanel targetType="employee" targetId={emp.id} />
            {/* 변동 이력: 임직원용 이력 소스 연결 전이라 빈 상태로 골격만 노출한다. */}
            <ChangeHistoryPanel contributions={undefined} />
          </div>
        </div>
      )}
    </div>
  )
}
