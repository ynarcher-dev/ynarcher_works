import { BackButton, Banner, Button, DetailTopBar, Spinner } from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DetailDeleteButton } from '@/components/DetailDeleteButton'
import { MaPartyForm } from '@/features/mna/parties/MaPartyForm'
import { MaPartyView } from '@/features/mna/parties/MaPartyView'
import { MA_BUYER, MA_SELLER, type MaPartyConfig } from '@/features/mna/parties/config'
import { useDeactivateMaParty, useMaPartyRecord } from '@/features/mna/parties/hooks'
import { useAuthStore } from '@/auth/authStore'

/**
 * M&A 거래상대 상세페이지. `id`가 'new'면 등록 모드이며, 등록·수정은 모달이 아니라
 * 이 페이지의 편집 모드(`MaPartyForm`)가 받는다 — 본문 에디터가 모달에 들어가기에는 크다.
 */
function MaPartyDetailPage({ config }: { config: MaPartyConfig }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = id === 'new'
  const [editing, setEditing] = useState(isNew)
  const { data: record, isLoading } = useMaPartyRecord(config, isNew ? undefined : id)
  const deactivate = useDeactivateMaParty(config)
  const authUser = useAuthStore((state) => state.user)
  const canEdit =
    Boolean(record) &&
    (authUser?.role === 'super_admin' || record?.created_by === authUser?.id)
  const canDeactivate =
    Boolean(record) &&
    (authUser?.role === 'super_admin' || record?.created_by === authUser?.id)

  if (!isNew && isLoading) return <Spinner />
  if (!isNew && !record) {
    return <Banner tone="warning">{config.noun} 정보를 찾을 수 없습니다.</Banner>
  }

  return (
    <div className="space-y-5">
      {/* 편집 중에는 폼(FormTopBar)이 상단 바를 소유한다. */}
      {!editing && (
        <DetailTopBar
          back={<BackButton as={Link} to={config.basePath} />}
          actions={
            !isNew &&
            record &&
            canEdit && (
              <>
                {/* 사유는 원장 컬럼이 아니라 변동 이력의 note로 남는다(deactivate_entity RPC). */}
                {canDeactivate && (
                  <DetailDeleteButton
                    name={record.name}
                    onDelete={(reason) =>
                      deactivate.mutateAsync({ id: record.id, reason: reason ?? '' })
                    }
                    onDeleted={() => navigate(config.basePath)}
                  />
                )}
                <Button onClick={() => setEditing(true)}>수정</Button>
              </>
            )
          }
        />
      )}

      {editing ? (
        <MaPartyForm
          config={config}
          recordId={isNew ? undefined : id}
          initial={isNew ? null : (record ?? null)}
          backTo={config.basePath}
          onDone={({ id: newId }) => {
            setEditing(false)
            if (isNew) navigate(`${config.basePath}/${newId}`)
          }}
          onCancel={() => (isNew ? navigate(config.basePath) : setEditing(false))}
        />
      ) : (
        record && <MaPartyView config={config} record={record} />
      )}
    </div>
  )
}

/** 라우터가 붙이는 진입점 둘 — 어느 원장인지는 라우트가 아니라 화면이 답한다. */
export function MaBuyerDetailPage() {
  return <MaPartyDetailPage config={MA_BUYER} />
}

export function MaSellerDetailPage() {
  return <MaPartyDetailPage config={MA_SELLER} />
}
