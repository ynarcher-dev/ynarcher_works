import { Badge, Banner, Button, Spinner } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EntityForm } from '@/features/networks/EntityForm'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { ENTITIES, type EntityKey } from '@/features/networks/config'
import { useEntity, type EntityRow } from '@/features/networks/hooks'

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

/** 조직 마스터 상세 뷰(읽기 전용 카드). 기업·기관·대학·외주/거래·미분류 공용. */
function EntityView({ entity, record }: { entity: EntityKey; record: EntityRow }) {
  const label = ENTITIES[entity].label
  const contact = (record.contact ?? {}) as Record<string, unknown>
  const affiliation = (contact.affiliation as string) ?? ''
  const department = (contact.department as string) ?? ''
  const position = (contact.position as string) ?? ''
  const category = (contact.category as string) ?? ''
  // 부제: 소속 · 부서명 · 직책(전문가 상세와 동일하게, 부서명은 소속과 직책 사이).
  const subtitle = [affiliation, department, position].filter(Boolean).join(' · ')

  return (
    <div className="space-y-4">
      <section className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
        <div className="flex items-center gap-5">
          <PhotoBox src={(contact.photo as string) ?? null} />
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
            </div>
            <p className="mt-1 text-body text-gray-500">{subtitle || '-'}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2.5 border-t border-gray-100 pt-4 sm:grid-cols-3">
          <Info label="이메일" value={(contact.email as string) || '-'} />
          <Info label="연락" value={(contact.phone as string) || '-'} />
          <Info label="구분" value={category || '-'} />
          <Info label="작성자" value="홍길동" />
          <Info label="수정일" value={formatDate(record.updated_at)} />
        </div>
      </section>
    </div>
  )
}

interface Props {
  /** 대상 조직 엔티티(기업·기관·대학·외주/거래·미분류 공용). 라우트별로 고정 전달한다. */
  entity: EntityKey
  /** 읽기 전용 모드(향후 HUB 조회 등). true면 수정 버튼·편집 폼을 노출하지 않는다. */
  readOnly?: boolean
  /** 목록/뒤로가기 경로. 기본 NETWORKS 디렉토리. */
  listPath?: string
  /** 뒤로가기 라벨(기본 `${label} 네트워크`). */
  backLabel?: string
}

/**
 * 조직 마스터 상세페이지(기업·기관·대학·외주/거래·미분류 공용). `id`가 'new'면 등록 모드.
 * 등록/수정은 모달이 아닌 이 페이지에서 카드 섹션 폼으로 처리한다(프로필 상세페이지와 동일한 형태).
 */
export function EntityDetailPage({
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
        <EntityForm
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
        record && <EntityView entity={entity} record={record} />
      )}
    </div>
  )
}
