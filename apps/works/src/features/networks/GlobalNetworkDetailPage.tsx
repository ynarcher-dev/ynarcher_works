import { BackButton, Badge, Banner, Button, CardShell, cardText, DensityProvider, InfoField, PanelCard, Spinner } from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DetailDeleteButton } from '@/components/DetailDeleteButton'
import { GlobalNetworkForm } from '@/features/networks/GlobalNetworkForm'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { ChangeHistoryPanel, uniqueContributors } from '@/features/networks/ChangeHistoryPanel'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { AffiliationHistoryPanel } from '@/features/networks/AffiliationHistoryPanel'
import { type GlobalRow } from '@/features/networks/globalConfig'
import { useDeactivateGlobal, useGlobalContributions, useGlobalEntity } from '@/features/networks/globalHooks'

const LIST_PATH = '/networks?tab=global'

/** 라벨: 값 한 줄 — 규격은 공용 `InfoField`가 소유한다. */
const Info = InfoField

function formatDate(v: unknown): string {
  const s = v ? String(v) : ''
  return s.length >= 10 ? s.slice(0, 10) : '-'
}

/** 글로벌 네트워크 읽기 전용 카드 뷰. */
function GlobalView({ record }: { record: GlobalRow }) {
  const profile = (record.profile ?? {}) as Record<string, unknown>
  const affiliation = (record.affiliation as string) ?? ''
  const department = (profile.department as string) ?? ''
  const position = (profile.position as string) ?? ''
  const subtitle = [affiliation, department, position].filter(Boolean).join(' · ')
  const linkedin = (record.linkedin_url as string) ?? ''
  const expertise = Array.isArray(record.expertise) ? (record.expertise as string[]) : []
  const intro = (profile.intro as string) ?? ''

  const { data: contributions } = useGlobalContributions(record.id)
  const contributors = uniqueContributors(contributions ?? [])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* 좌측(2/3): 프로필 본문 — 현행 유지(메모 포함). */}
      <div className="space-y-4 lg:col-span-2">
      <CardShell>
        <div className="flex items-center gap-5">
          <PhotoBox src={(profile.photo as string) ?? null} />
          <div className="min-w-0 flex-1">
            {/* 상세 헤더는 카드 안에 있어도 페이지 맥락이다 — 24px 제목 옆 배지가 11px로 찍히지 않게 한다. */}
            <DensityProvider value="page">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-title-md font-bold text-gray-900">{record.name}</h1>
                {record.category && <Badge tone="neutral">{record.category}</Badge>}
              </div>
            </DensityProvider>
            <p className={`mt-1 ${cardText.subtitle}`}>{subtitle || '-'}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2.5 border-t border-gray-100 pt-4 sm:grid-cols-3">
          <Info label="연락처" value={(record.phone as string) || '-'} />
          <Info label="이메일" value={(record.email as string) || '-'} />
          <Info
            label="링크드인"
            value={
              linkedin ? (
                <a
                  href={linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-info hover:underline"
                >
                  프로필 열기
                </a>
              ) : (
                '-'
              )
            }
          />
          <Info label="권역" value={record.region?.name || '-'} />
          <Info label="국가" value={record.country?.name || '-'} />
          <Info
            label="전문 분야"
            value={
              expertise.length ? (
                <span className="flex flex-wrap gap-1">
                  {expertise.map((e) => (
                    <Badge key={e} tone="neutral">{e}</Badge>
                  ))}
                </span>
              ) : (
                '-'
              )
            }
          />
          <Info label="기여자" value={contributors.length ? contributors.join(', ') : '-'} />
          <Info label="수정일" value={formatDate(record.updated_at)} />
        </div>
      </CardShell>

      <PanelCard title="노트">
        {intro ? (
          <p className="whitespace-pre-wrap text-body text-gray-800">{intro}</p>
        ) : (
          <p className="text-body text-gray-600">등록된 노트 내용이 없습니다.</p>
        )}
      </PanelCard>

      {/* 이력(소속·부서·직책 변경): 국내 상세와 동일 규격. 현재값은 부제가, 과거 조합은 이 카드가 담는다. */}
      <PanelCard title="이력">
        <AffiliationHistoryPanel profile={profile} contributions={contributions} />
      </PanelCard>
      </div>

      {/* 우측(1/3): 자료 관리 → 변동 이력 → 피드백. 국내 상세와 공용 패널. */}
      <div className="space-y-4 lg:col-span-1">
        <MaterialPanel targetType="global_network" targetId={record.id} readOnly />
        <FeedbackPanel targetType="global_network" targetId={record.id} />
        <ChangeHistoryPanel contributions={contributions} />
      </div>
    </div>
  )
}

/**
 * 글로벌 네트워크 상세페이지. `id`가 'new'면 등록 모드(모달이 아닌 페이지형 폼).
 * 국내 NetworkDetailPage와 동일한 뒤로가기·조회/편집 토글 구조를 따른다.
 */
export function GlobalNetworkDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = id === 'new'
  const [editing, setEditing] = useState(isNew)
  const { data: record, isLoading } = useGlobalEntity(isNew ? undefined : id)
  const deactivate = useDeactivateGlobal()

  if (!isNew && isLoading) return <Spinner />
  if (!isNew && !record) {
    return <Banner tone="warning">글로벌 네트워크 정보를 찾을 수 없습니다.</Banner>
  }

  return (
    <div className="space-y-5">
      {/* 편집 중에는 폼(FormTopBar)이 상단 바를 소유한다 — 뒤로가기 옆 우측 자리를 취소·확정이 쓴다. */}
      {!editing && (
        <div className="flex items-center justify-between">
          <BackButton as={Link} to={LIST_PATH} />
          {!isNew && record && (
            <div className="flex items-center gap-2">
              <DetailDeleteButton
                name={record.name ? String(record.name) : undefined}
                onDelete={(reason) => deactivate.mutateAsync({ id: record.id, reason: reason ?? '' })}
                onDeleted={() => navigate(LIST_PATH)}
              />
              <Button onClick={() => setEditing(true)}>수정</Button>
            </div>
          )}
        </div>
      )}

      {editing ? (
        <GlobalNetworkForm
          recordId={isNew ? undefined : id}
          initial={isNew ? null : (record ?? null)}
          backTo={LIST_PATH}
          onDone={(savedId) => {
            setEditing(false)
            if (isNew) navigate(`/networks/global/${savedId}`)
          }}
          onCancel={() => (isNew ? navigate(LIST_PATH) : setEditing(false))}
        />
      ) : (
        record && <GlobalView record={record} />
      )}
    </div>
  )
}
