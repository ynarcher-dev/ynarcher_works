import { BackButton, Badge, Banner, Button, CardShell, cardText, DensityProvider, InfoField, PanelCard, Spinner } from '@ynarcher/ui'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DetailDeleteButton } from '@/components/DetailDeleteButton'
import { EmployeeForm } from '@/features/management/EmployeeForm'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { CareerView, hasCareerRows } from '@/features/management/CareerView'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { ChangeHistoryPanel } from '@/features/networks/ChangeHistoryPanel'
import { EmployeeActivitySection } from '@/features/management/EmployeeActivitySection'
import { ROLE_LABELS } from '@/features/management/config'
import { affiliationLabel } from '@/features/management/departmentOptions'
import { useDeactivateEmployee, useDepartments, useEmployee } from '@/features/management/hooks'
import { useJobTitleLabel } from '@/features/management/jobTitleHooks'
import { legacyNote, parseNote } from '@/features/management/noteConfig'
import { useEmployeeBranchNames } from '@/features/office/branches/branchMembers'

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
 * 임직원 상세페이지(조회 전용). 전문가 상세 레이아웃을 따르되 멘토링 만족도·매칭·전문분야는 제외한다.
 * 사진·약력·노트는 NETWORKS 상세와 동일한 규격(profile.photo / profile.background / profile.note)으로 표시한다.
 * 우측 자료 관리·피드백 패널은 다형(target_type/target_id) 공용 패널을 재사용한다.
 * OFFICE(임직원 정보)에서 진입할 때는 readOnly로 수정 버튼을 숨기고 조회만 제공하며,
 * 호봉은 인사 관리 맥락에서만 표기한다(showPayStep=false).
 */
interface EmployeeDetailPageProps {
  /** 조회 전용(OFFICE 진입): 수정 버튼/편집 모드를 제공하지 않는다. */
  readOnly?: boolean
  /** 뒤로가기 경로. 기본은 인사 관리 리스트. */
  backTo?: string
  /** 호봉 표기. 인사 관리(MANAGEMENT)만 true, OFFICE 임직원 정보는 false로 내린다. */
  showPayStep?: boolean
}

export function EmployeeDetailPage({
  readOnly = false,
  backTo = '/management?tab=hr',
  showPayStep = true,
}: EmployeeDetailPageProps = {}) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  // 임직원은 내부 구성원이라 개인정보 마스킹 대상이 아니다(민감정보 정책은 외부 인물·기업만 다룬다).
  const [editing, setEditing] = useState(false)
  const { data: emp, isLoading } = useEmployee(id)
  const { data: depts } = useDepartments()
  // 비활성화(소프트 삭제)는 목록의 관리 컬럼이 아니라 이 상세 상단바가 소유한다.
  const deactivate = useDeactivateEmployee()
  // 지사는 지사 원장(branch_members)에서 파생한다 — ADMIN '지사 관리'에서 배정하면 여기에 그대로 뜬다.
  const { branchNamesOf } = useEmployeeBranchNames()
  // 이름 옆 호칭은 직급·직책 태그 원장의 표기 방식이 정한다(코드에 목록을 박지 않는다).
  const jobTitle = useJobTitleLabel()

  if (isLoading) return <Spinner />
  if (!emp) return <Banner tone="warning">임직원 정보를 찾을 수 없습니다.</Banner>

  // 부서/팀 표기(상위 · 하위)의 규칙은 departmentOptions.affiliationLabel이 소유한다.
  const subtitle = affiliationLabel(depts ?? [], emp.department_id ?? null) || '-'

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
  // 노트는 철학·관심분야·한마디 세 항목이다. 아직 옮기지 않은 자유 텍스트 노트는 '이전 기록'으로 남긴다.
  const note = parseNote(profile)
  const oldNote = legacyNote(profile)
  // 이름 옆 배지는 자리 표기(직급 직책) + 관리자(super_admin)뿐이다 — 나머지 역할은 부서로 드러난다.
  // 자리 표기가 앞이다: 이 사람이 무엇을 하는 사람인가가 계정 권한보다 먼저 읽혀야 한다.
  const jobLabel = jobTitle(rank, position)
  const adminLabel = emp.user_type === 'super_admin' ? ROLE_LABELS[emp.user_type] : ''
  const branchLabel = branchNamesOf(emp.id).join(', ')
  const email = emp.email ?? '-'
  const phone = emp.phone ?? '-'

  return (
    <div className="space-y-5">
      {/* 편집 중에는 폼(FormTopBar)이 상단 바를 소유한다 — 뒤로가기 옆 우측 자리를 취소·확정이 쓴다. */}
      {!editing && (
        <div className="flex items-center justify-between">
          <BackButton as={Link} to={backTo} />
          {!readOnly && (
            <div className="flex items-center gap-2">
              {/* 임직원 원장은 사유 기록 인프라(기여 로그 RPC)가 없어 확인창만 띄운다. */}
              <DetailDeleteButton
                name={emp.name}
                label="비활성화"
                withReason={false}
                onDelete={() => deactivate.mutateAsync(emp.id)}
                onDeleted={() => navigate(backTo)}
              />
              <Button onClick={() => setEditing(true)}>수정</Button>
            </div>
          )}
        </div>
      )}

      {editing ? (
        <EmployeeForm
          recordId={emp.id}
          initial={emp}
          backTo={backTo}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
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
                      {jobLabel && <Badge tone="neutral">{jobLabel}</Badge>}
                      {adminLabel && <Badge tone="neutral">{adminLabel}</Badge>}
                    </div>
                  </DensityProvider>
                  <p className={`mt-1 ${cardText.subtitle}`}>{subtitle}</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-2.5 border-t border-gray-100 pt-4 sm:grid-cols-3">
                <Info label="회사" value={company || '-'} />
                <Info label="지사" value={branchLabel || '-'} />
                {/* 직책·직급은 이름 옆 호칭 태그가 이미 말한다 — 같은 값을 아래에 한 번 더 적지 않는다. */}
                {/* 호봉은 인사 관리 맥락에서만 표기한다(OFFICE 임직원 정보에서는 감춤). */}
                {showPayStep && <Info label="호봉" value={payStep || '-'} />}
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

            <SectionCard title="액셀러레이터 철학">
              {note.philosophy ? (
                <p className="whitespace-pre-wrap text-body text-gray-800">{note.philosophy}</p>
              ) : (
                <p className="text-body text-gray-600">등록된 내용이 없습니다.</p>
              )}
            </SectionCard>

            <SectionCard title="관심분야">
              {note.interests.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {note.interests.map((name) => (
                    <Badge key={name} tone="neutral">
                      {name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-body text-gray-600">등록된 관심분야가 없습니다.</p>
              )}
            </SectionCard>

            <SectionCard title="한마디">
              {note.oneLiner ? (
                <p className="whitespace-pre-wrap text-body text-gray-800">{note.oneLiner}</p>
              ) : (
                <p className="text-body text-gray-600">등록된 내용이 없습니다.</p>
              )}
            </SectionCard>

            {/* 세 항목으로 가르기 전의 자유 텍스트 노트. '수정'에서 세 칸으로 나눠 저장하면 사라진다. */}
            {oldNote && (
              <SectionCard title="노트(이전 기록)">
                <p className="whitespace-pre-wrap text-body text-gray-800">{oldNote}</p>
                <p className="mt-2 text-caption text-gray-700">
                  "수정"을 열면 이 글이 액셀러레이터 철학 칸에 담겨 있습니다. 세 항목으로 나눠 저장하세요.
                </p>
              </SectionCard>
            )}

            {/* 담당자로 배정된 레코드(읽기 전용). 프로필 본문과 구분선으로 가른다. */}
            <EmployeeActivitySection userId={emp.id} />
          </div>

          {/* 우측(1/3): 자료 관리 → 변동 이력 → 코멘트(공용 패널 재사용).
              전자결재·회의록은 임직원 개인에 붙는 축이 아니라 여기서는 뺀다. */}
          <div className="space-y-4 lg:col-span-1">
            {/* 조회 전용 진입(OFFICE 임직원 정보)에서는 자료도 목록·다운로드만 — 원장 쓰기는 MANAGEMENT 소관. */}
            <MaterialPanel targetType="employee" targetId={emp.id} readOnly={readOnly} />
            {/* 변동 이력: 임직원용 이력 소스 연결 전이라 빈 상태로 골격만 노출한다. */}
            <ChangeHistoryPanel contributions={undefined} />
            <FeedbackPanel targetType="employee" targetId={emp.id} />
          </div>
        </div>
      )}
    </div>
  )
}
