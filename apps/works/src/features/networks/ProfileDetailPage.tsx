import { Badge, Banner, Button, Spinner } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ProfileForm } from '@/features/networks/ProfileForm'
import { PhotoBox } from '@/features/networks/PhotoBox'
import {
  CAREER_SECTIONS,
  formatRow,
  parseBackground,
} from '@/features/networks/careerConfig'
import {
  ENTITIES,
  PROFILE_RESOURCE_TYPE,
  type EntityKey,
} from '@/features/networks/config'
import { SensitiveValue } from '@/features/master/SensitiveValue'
import { useEntity, type EntityRow } from '@/features/networks/hooks'

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
    <section className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-body font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** 라벨: 값 한 줄. */
function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-caption text-gray-400">{label}:</span>
      <span className="text-body text-gray-800">{value ?? '-'}</span>
    </div>
  )
}

function formatDate(v: unknown): string {
  const s = v ? String(v) : ''
  return s.length >= 10 ? s.slice(0, 10) : '-'
}

/** 네트워크 프로필 상세 뷰(읽기 전용 카드). 전문가·VAN·투자사 공용. */
function ProfileView({ entity, record }: { entity: EntityKey; record: EntityRow }) {
  const label = ENTITIES[entity].label
  const resourceType = PROFILE_RESOURCE_TYPE[entity] ?? entity
  const profile = (record.profile ?? {}) as Record<string, unknown>
  const expertise = Array.isArray(record.expertise)
    ? (record.expertise as string[])
    : []
  const matchOk = profile.match_available !== false
  const background = parseBackground(profile.background)
  const hasCareer = CAREER_SECTIONS.some((s) =>
    (background[s.key] ?? []).some((r) => formatRow(s, r)),
  )
  const intro = (profile.intro as string) ?? ''
  const affiliation = (record.affiliation as string) ?? ''
  const department = (profile.department as string) ?? ''
  const position = (profile.position as string) ?? ''
  const category = (profile.category as string) ?? ''
  // 부제: 소속 · 부서명 · 직책(부서명은 소속과 직책 사이에 노출).
  const subtitle = [affiliation, department, position].filter(Boolean).join(' · ')

  return (
    <div className="space-y-4">
      <section className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
        <div className="flex items-center gap-5">
          <PhotoBox src={(profile.photo as string) ?? null} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-title-md font-bold text-gray-900">
                {(record.name as string) ?? label}
              </h1>
              {category && (
                <Badge tone="neutral" size="sm">
                  {category}
                </Badge>
              )}
              <Badge tone={matchOk ? 'success' : 'neutral'} size="sm">
                매칭 {matchOk ? '가능' : '불가능'}
              </Badge>
            </div>
            <p className="mt-1 text-body text-gray-500">{subtitle || '-'}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2.5 border-t border-gray-100 pt-4 sm:grid-cols-3">
          <Info
            label="연락처"
            value={
              <SensitiveValue
                field="phone"
                value={(record.phone as string) ?? null}
                resourceType={resourceType}
                resourceId={record.id}
              />
            }
          />
          <Info
            label="이메일"
            value={
              <SensitiveValue
                field="email"
                value={(record.email as string) ?? null}
                resourceType={resourceType}
                resourceId={record.id}
              />
            }
          />
          <Info
            label="전문 분야"
            value={
              expertise.length ? (
                <span className="flex flex-wrap gap-1">
                  {expertise.map((e) => (
                    <Badge key={e} tone="neutral" size="sm">
                      {e}
                    </Badge>
                  ))}
                </span>
              ) : (
                '-'
              )
            }
          />
          <Info label="작성자" value="홍길동" />
          <Info label="수정일" value={formatDate(record.updated_at)} />
        </div>
      </section>

      <SectionCard title="약력">
        {hasCareer ? (
          <div className="space-y-4">
            {CAREER_SECTIONS.map((s) => {
              const rows = (background[s.key] ?? []).filter((r) => formatRow(s, r))
              if (!rows.length) return null
              return (
                <div key={s.key}>
                  <h3 className="mb-1 text-caption font-semibold text-gray-500">
                    {s.title}
                  </h3>
                  <ul className="space-y-0.5">
                    {rows.map((r, i) => (
                      <li key={i} className="text-body text-gray-800">
                        {formatRow(s, r)}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-body text-gray-400">
            등록된 약력이 없습니다. "수정"에서 입력하세요.
          </p>
        )}
      </SectionCard>

      <SectionCard title="메모">
        {intro ? (
          <p className="whitespace-pre-wrap text-body text-gray-800">{intro}</p>
        ) : (
          <p className="text-body text-gray-400">등록된 메모 내용이 없습니다.</p>
        )}
      </SectionCard>

      <SectionCard title="멘토링 만족도">
        <div className="flex items-center gap-6">
          <span className="inline-flex items-center gap-1.5 text-title-sm font-semibold text-gray-900">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-warning" aria-hidden>
              <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            5.0
          </span>
          <div>
            <p className="text-caption text-gray-400">멘토링 이력</p>
            <p className="text-body font-medium text-gray-800">0 건</p>
          </div>
        </div>
      </SectionCard>

      <Banner tone="info">
        스타트업 자문 매칭 히스토리 — 자문 일자·대상 스타트업·담당 심사역·피드백 이력 연동은
        프로젝트/스타트업 도메인(Phase 4) 개발 시 연결됩니다.
        <span className="ml-1">(현재 매칭 상태: {matchOk ? '가능' : '불가능'})</span>
      </Banner>
    </div>
  )
}

interface Props {
  /** 대상 엔티티(전문가·VAN·투자사 공용). 라우트별로 고정 전달한다. */
  entity: EntityKey
  /**
   * 읽기 전용 모드(HUB 조회 센터). true면 수정 버튼·편집 폼을 노출하지 않는다.
   * HUB는 마스터를 소유하지 않으므로 조회만 하고, 편집은 NETWORKS 원장에서 수행한다.
   */
  readOnly?: boolean
  /** 목록/뒤로가기 경로. 기본 NETWORKS 디렉토리. HUB는 `/hub?tab=experts`. */
  listPath?: string
  /** 뒤로가기 라벨(기본 `${label} 네트워크`). HUB 병합 탭은 '투자/전문가 네트워크'. */
  backLabel?: string
}

/**
 * 네트워크 프로필 상세페이지(전문가·VAN·투자사 공용). `id`가 'new'면 등록 모드.
 * 등록/수정은 모달이 아닌 이 페이지에서 카드 섹션 폼으로 처리한다.
 * `readOnly`(HUB 조회 센터)면 편집 없이 조회 뷰만 렌더한다.
 */
export function ProfileDetailPage({
  entity,
  readOnly = false,
  listPath: listPathProp,
  backLabel,
}: Props) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const label = ENTITIES[entity].label
  const listPath = listPathProp ?? `/networks?tab=${entity}`
  const backText = backLabel ?? `${label} 네트워크`
  const isNew = id === 'new'
  const [editing, setEditing] = useState(isNew && !readOnly)
  const { data: record, isLoading } = useEntity(entity, isNew ? undefined : id)

  if (!isNew && isLoading) return <Spinner />
  if (!isNew && !record) {
    return <Banner tone="warning">{label} 정보를 찾을 수 없습니다.</Banner>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link
          to={listPath}
          className="text-caption font-semibold text-brand hover:text-brand-600"
        >
          ← {backText}
        </Link>
        {!isNew && !editing && !readOnly && (
          <Button onClick={() => setEditing(true)}>수정</Button>
        )}
      </div>

      {editing && (
        <h1 className="text-title-md font-bold text-gray-900">
          {isNew ? `${label} 등록` : `${label} 수정`}
        </h1>
      )}

      {editing ? (
        <ProfileForm
          entity={entity}
          recordId={isNew ? undefined : id}
          initial={isNew ? null : (record ?? null)}
          onDone={(newId) => {
            setEditing(false)
            if (isNew) navigate(`/networks/${entity}/${newId}`)
          }}
          onCancel={() => (isNew ? navigate(listPath) : setEditing(false))}
        />
      ) : (
        record && <ProfileView entity={entity} record={record} />
      )}
    </div>
  )
}
