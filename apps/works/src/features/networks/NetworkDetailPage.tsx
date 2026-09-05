import {
  BackButton,
  Badge,
  Banner,
  Button,
  CardShell,
  cardText,
  DensityProvider,
  InfoField,
  InfoGrid,
  PanelCard,
  Spinner,
} from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DetailDeleteButton } from '@/components/DetailDeleteButton'
import { LinkedInLink } from '@/components/LinkedInLink'
import { WhatsAppMark } from '@/components/WhatsAppMark'
import { NetworkForm } from '@/features/networks/NetworkForm'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { ChangeHistoryPanel, uniqueContributors } from '@/features/networks/ChangeHistoryPanel'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { AffiliationHistoryPanel } from '@/features/networks/AffiliationHistoryPanel'
import { RelatedMinutesPanel } from '@/features/office/minutes/RelatedMinutesPanel'
import type { MinuteLinkTargetType } from '@/features/office/minutes/minuteLinks'
import {
  categoryLabel,
  isCompactCategory,
  NETWORK_RESOURCE_TYPE,
  NETWORK_TARGET_TYPE,
  type NetworkCategory,
} from '@/features/networks/config'
import { SensitiveValue } from '@/features/master/SensitiveValue'
import {
  countryLabelOf,
  useContributions,
  useDeactivateNetwork,
  useNetworkRecord,
  type NetworkRow,
} from '@/features/networks/hooks'

/** 상세 카드 섹션 래퍼. */
function SectionCard({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <PanelCard title={title} action={action}>
      {children}
    </PanelCard>
  )
}

/** 라벨: 값 한 줄 — 규격은 공용 `InfoField`가 소유한다. */
const Info = InfoField

/**
 * 민감정보 정책 콘텐츠 키. 원장이 하나가 되면서 상세도 목록과 같은 키를 쓴다 —
 * 종전에는 구분마다 키가 갈려 있었고(networks.experts 등) 그 목록은 이미 사라졌다.
 */
const CONTENT_KEY = 'networks.all'

function formatDate(v: unknown): string {
  const s = v ? String(v) : ''
  return s.length >= 10 ? s.slice(0, 10) : '-'
}

/**
 * 네트워크 상세 뷰(읽기 전용 카드). 전 구분·전 국가 공용 한 벌이다.
 * 축약(compact) 유형(조직형 + 구분 미지정)은 매칭 배지·전문영역 섹션을 숨긴다.
 */
function NetworkView({ record }: { record: NetworkRow }) {
  const category = (record.category as string) ?? ''
  const label = categoryLabel(category) || '네트워크'
  const compact = isCompactCategory(category || null)
  const profile = (record.profile ?? {}) as Record<string, unknown>
  const expertise = Array.isArray(record.expertise) ? (record.expertise as string[]) : []
  const matchOk = profile.match_available !== false
  const intro = (profile.intro as string) ?? ''
  const affiliation = (record.affiliation as string) ?? ''
  const department = (profile.department as string) ?? ''
  const position = (profile.position as string) ?? ''
  const linkedin = (record.linkedin_url as string) ?? ''
  // 와츠앱은 번호의 성질이라 번호가 있을 때만 뜻이 있다.
  const whatsapp = profile.whatsapp === true && !!record.phone
  const country = countryLabelOf(record)
  const region = (record.region_name as string) ?? ''
  const overseas = record.region_scope === 'OVERSEAS'
  // 부제: 소속 · 부서명 · 직책(부서명은 소속과 직책 사이에 노출).
  const subtitle = [affiliation, department, position].filter(Boolean).join(' · ')

  // 생성자(created_by)와 담당자는 별개 축이다. NETWORKS는 담당자 원장이 없는 영구 공동관리이므로
  // 특정 담당자 없이 기여자 목록으로 표시하고, 레코드를 만든 사람은 생성자로 별도 표기한다.
  const { data: contributions } = useContributions(record.id as string)
  const contributors = uniqueContributors(contributions ?? [])
  const creator = (record.creator?.name as string) || '-'

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* 좌측(2/3): 프로필 본문 — 기본 정보·이력·소개. */}
      <div className="space-y-4 lg:col-span-2">
      <CardShell>
        <div className="flex items-center gap-5">
          <PhotoBox src={(profile.photo as string) ?? null} />
          <div className="min-w-0 flex-1">
            {/* 상세 헤더는 카드 안에 있어도 페이지 맥락이다 — 24px 제목 옆 배지가 11px로 찍히지 않게 한다. */}
            <DensityProvider value="page">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-title-md font-bold text-gray-900">
                  <SensitiveValue
                    field="name"
                    contentKey={CONTENT_KEY}
                    value={(record.name as string) ?? label}
                    resourceType={NETWORK_RESOURCE_TYPE}
                    resourceId={record.id as string}
                  />
                </h1>
                {category && <Badge tone="neutral">{categoryLabel(category)}</Badge>}
                {!compact && (
                  <Badge tone={matchOk ? 'success' : 'neutral'}>
                    매칭 {matchOk ? '가능' : '불가능'}
                  </Badge>
                )}
              </div>
            </DensityProvider>
            <p className={`mt-1 ${cardText.subtitle}`}>{subtitle || '-'}</p>
          </div>
        </div>

        <div className="mt-5 border-t border-gray-100 pt-4">
          <InfoGrid>
            <Info
              label="연락처"
              // 값이 아이콘·버튼을 품어 글자보다 키가 커진 줄이다. 밑선을 맞추면 라벨이 값 상자의
              // 아래 모서리에 걸려 한 칸 내려앉으므로, 이 줄만 가운데 축으로 세운다.
              className="items-center"
              value={
                <span className="inline-flex items-center gap-1.5">
                  {/* 표식은 '연락처' 라벨 바로 옆, 번호 앞에 선다. 뒤에 두면 '보기' 버튼 너머로
                      밀려 어느 값에 붙은 성질인지가 끊기고, 별도 줄로 세우면 '와츠앱: 예'가 되어
                      어느 번호로 닿는다는 뜻이 번호에서 떨어져 나간다. */}
                  {whatsapp && <WhatsAppMark />}
                  <SensitiveValue
                    field="phone"
                    contentKey={CONTENT_KEY}
                    value={(record.phone as string) ?? null}
                    resourceType={NETWORK_RESOURCE_TYPE}
                    resourceId={record.id}
                  />
                </span>
              }
            />
            <Info
              label="이메일"
              value={
                <SensitiveValue
                  field="email"
                  contentKey={CONTENT_KEY}
                  value={(record.email as string) ?? null}
                  resourceType={NETWORK_RESOURCE_TYPE}
                  resourceId={record.id}
                />
              }
            />
            {/* 링크드인은 값이 없어도 선다 — 없다는 사실은 줄을 감추는 것이 아니라 꺼진
                아이콘이 말한다(목록과 같은 규칙). 규격은 공용 `LinkedInLink`가 갖는다.
                연락처·이메일과 한 줄에 서는 것은 셋이 같은 축(이 사람에게 닿는 수단)이기
                때문이다 — 3열 격자에서 순서가 곧 묶음이라, 사이에 국가가 끼면 연락 수단이
                두 줄로 갈린다. */}
            <Info
              label="링크드인"
              value={<LinkedInLink url={linkedin} />}
              // 아이콘 값은 baseline이 아니라 가운데에 선다 — baseline은 글자의 축이라
              // 그림을 걸면 아래쪽 모서리가 글자 밑선에 맞아 눈에는 한 칸 떠 보인다.
              valueClassName="self-center"
            />
            {/* 국가는 늘 선다 — 한국도 '한국'으로 명시한다. 권역은 해외에서만 괄호로 덧붙인다:
                여러 나라를 묶어 읽을 때만 쓰이는 축이라, 국내 한 나라뿐인 '한국 (국내)'의
                괄호는 같은 말을 두 번 하고 정작 국가명을 밀어낸다. */}
            <Info label="국가" value={overseas && region ? `${country} (${region})` : country} />
            {!compact && (
              <Info
                label="전문 영역"
                value={
                  expertise.length ? (
                    <span className="flex flex-wrap gap-1">
                      {expertise.map((e) => (
                        <Badge key={e} tone="neutral">
                          {e}
                        </Badge>
                      ))}
                    </span>
                  ) : (
                    '-'
                  )
                }
              />
            )}
          </InfoGrid>

          {/*
            생성자·기여자·수정일은 레코드 자체가 아니라 레코드를 다룬 흔적이다. 위 칸의 업무
            사실(연락처·국가·전문 영역)과 한 격자에 섞이면 여덟 칸이 같은 무게로 서서, 이 사람이
            누구인가를 읽으려는 눈이 매번 관리 정보를 함께 훑는다. 구분선으로 축을 가르고 톤도
            한 단 낮춘다(`InfoField`의 meta — 이 세 값을 위해 있는 자리다).
          */}
          <InfoGrid className="mt-3 border-t border-gray-100 pt-3">
            <Info label="생성자" value={creator} meta />
            <Info label="기여자" value={contributors.length ? contributors.join(', ') : '-'} meta />
            <Info label="수정일" value={formatDate(record.updated_at)} meta />
          </InfoGrid>
        </div>
      </CardShell>

      {/* 이력(소속·부서·직책 변경): 인물·조직 전 유형 공통 노출. 현재값은 부제가, 과거 조합은 이 카드가 담는다. */}
      <SectionCard title="이력">
        <AffiliationHistoryPanel profile={profile} contributions={contributions} />
      </SectionCard>

      <SectionCard title="소개">
        {intro ? (
          <p className="whitespace-pre-wrap text-body text-gray-800">{intro}</p>
        ) : (
          <p className="text-body text-gray-600">등록된 소개 내용이 없습니다.</p>
        )}
      </SectionCard>
      </div>

      {/* 우측(1/3): 자료 관리 → 관련 회의록 → 변동 이력 → 코멘트.
          공용 순서에서 전자결재는 빠진다 — 네트워크 인물은 결재를 올리는 단위가 아니다.
          회의록은 반대로 넣는다: 이들은 회의의 참석자가 되는 쪽이라, 사람 상세에서
          "이 사람이 낀 회의"를 되짚는 일이 잦다(연동 키는 자료·코멘트와 같은 값). */}
      <div className="space-y-4 lg:col-span-1">
        <MaterialPanel targetType={NETWORK_TARGET_TYPE} targetId={record.id as string} readOnly />
        <RelatedMinutesPanel
          targetType={NETWORK_TARGET_TYPE as MinuteLinkTargetType}
          targetId={record.id as string}
        />
        <ChangeHistoryPanel contributions={contributions} />
        <FeedbackPanel targetType={NETWORK_TARGET_TYPE} targetId={record.id as string} />
      </div>
    </div>
  )
}

interface Props {
  /**
   * 읽기 전용 모드(조회 전용 진입). true면 수정 버튼·편집 폼을 노출하지 않는다.
   * 마스터 편집은 NETWORKS 원장에서만 수행하고, 그 외 워크스페이스는 조회만 한다.
   */
  readOnly?: boolean
  /** 목록/뒤로가기 경로. 기본 '전체 네트워크'. */
  listPath?: string
}

/**
 * 네트워크 상세페이지. `id`가 'new'면 등록 모드이며 `?category=`로 초기 구분을 받는다.
 * 등록/수정은 모달이 아닌 이 페이지에서 카드 섹션 폼(`NetworkForm`)으로 처리한다.
 * 구분을 바꿔도 페이지를 옮기지 않는다 — 통합 원장에서 구분은 한 컬럼의 값이라 id가 그대로다.
 */
export function NetworkDetailPage({ readOnly = false, listPath: listPathProp }: Props) {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const listPath = listPathProp ?? '/networks?tab=all'
  const isNew = id === 'new'
  const [editing, setEditing] = useState(isNew && !readOnly)
  const { data: record, isLoading } = useNetworkRecord(isNew ? undefined : id)
  const deactivate = useDeactivateNetwork()

  if (!isNew && isLoading) return <Spinner />
  if (!isNew && !record) {
    return <Banner tone="warning">네트워크 정보를 찾을 수 없습니다.</Banner>
  }

  return (
    <div className="space-y-5">
      {/* 편집 중에는 폼(FormTopBar)이 상단 바를 소유한다 — 뒤로가기 옆 우측 자리를 취소·확정이 쓴다. */}
      {!editing && (
        <div className="flex items-center justify-between">
          <BackButton as={Link} to={listPath} />
          {!isNew && !readOnly && record && (
            <div className="flex items-center gap-2">
              <DetailDeleteButton
                name={(record.name as string) ?? undefined}
                onDelete={(reason) =>
                  deactivate.mutateAsync({ id: record.id as string, reason: reason ?? '' })
                }
                onDeleted={() => navigate(listPath)}
              />
              <Button onClick={() => setEditing(true)}>수정</Button>
            </div>
          )}
        </div>
      )}

      {editing ? (
        <NetworkForm
          recordId={isNew ? undefined : id}
          initial={isNew ? null : (record ?? null)}
          defaultCategory={(params.get('category') as NetworkCategory | null) ?? null}
          backTo={listPath}
          onDone={({ id: newId }) => {
            setEditing(false)
            if (isNew) navigate(`/networks/record/${newId}`)
          }}
          onCancel={() => (isNew ? navigate(listPath) : setEditing(false))}
        />
      ) : (
        record && <NetworkView record={record} />
      )}
    </div>
  )
}
