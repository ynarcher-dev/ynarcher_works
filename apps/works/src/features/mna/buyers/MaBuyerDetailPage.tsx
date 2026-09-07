import {
  BackButton,
  Banner,
  Button,
  CardShell,
  DensityProvider,
  EmptyState,
  InfoField,
  InfoGrid,
  PanelCard,
  Spinner,
} from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DetailDeleteButton } from '@/components/DetailDeleteButton'
import { RichTextViewer } from '@/components/RichTextEditor'
import { MaBuyerForm } from '@/features/mna/buyers/MaBuyerForm'
import {
  MA_BUYER_BASE_PATH,
  MA_BUYER_NOUN,
  toMillion,
  type MaBuyerRow,
} from '@/features/mna/buyers/config'
import { useDeleteMaBuyer, useMaBuyerRecord } from '@/features/mna/buyers/hooks'

function formatDate(v: string | null | undefined): string {
  return v && v.length >= 10 ? v.slice(0, 10) : '-'
}

/** 조회 뷰 — 칸 넷을 담은 머리 카드와 본문 카드 둘뿐이다. */
function MaBuyerView({ record }: { record: MaBuyerRow }) {
  const industries = Array.isArray(record.industries) ? record.industries : []
  const overview = record.overview_html ?? ''

  return (
    <div className="space-y-4">
      <CardShell>
        {/* 상세 제목은 카드 안에 있어도 페이지 맥락이다. */}
        <DensityProvider value="page">
          <h1 className="text-title-md font-bold text-gray-900">{record.name}</h1>
        </DensityProvider>

        <div className="mt-5 border-t border-gray-100 pt-4">
          <InfoGrid>
            <InfoField label="분야" value={industries.length ? industries.join(', ') : '-'} />
            <InfoField label="희망사항" value={record.wish || '-'} />
            <InfoField
              label="가용자금"
              value={
                record.available_funds == null
                  ? '-'
                  : `${toMillion(record.available_funds)}백만원`
              }
            />
            <InfoField label="생성자" value={record.creator?.name ?? '-'} />
            <InfoField label="등록일" value={formatDate(record.created_at)} />
            <InfoField label="수정일" value={formatDate(record.updated_at)} />
          </InfoGrid>
        </div>
      </CardShell>

      {/* 본문이 이 원장의 몸통이다 — 칸이 아니라 여기가 대부분의 내용을 갖는다. */}
      <PanelCard title="상세내용">
        {overview ? (
          <RichTextViewer html={overview} />
        ) : (
          <EmptyState
            title="아직 작성된 상세내용이 없습니다."
            description="수정에서 인수 배경·희망 조건·미팅 메모를 적을 수 있습니다."
          />
        )}
      </PanelCard>
    </div>
  )
}

/**
 * M&A BUYER 상세페이지. `id`가 'new'면 등록 모드이며, 등록·수정은 모달이 아니라
 * 이 페이지의 편집 모드(`MaBuyerForm`)가 받는다 — 본문 에디터가 모달에 들어가기에는 크다.
 */
export function MaBuyerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = id === 'new'
  const [editing, setEditing] = useState(isNew)
  const { data: record, isLoading } = useMaBuyerRecord(isNew ? undefined : id)
  const remove = useDeleteMaBuyer()

  if (!isNew && isLoading) return <Spinner />
  if (!isNew && !record) {
    return <Banner tone="warning">{MA_BUYER_NOUN} 정보를 찾을 수 없습니다.</Banner>
  }

  return (
    <div className="space-y-5">
      {/* 편집 중에는 폼(FormTopBar)이 상단 바를 소유한다. */}
      {!editing && (
        <div className="flex items-center justify-between">
          <BackButton as={Link} to={MA_BUYER_BASE_PATH} />
          {!isNew && record && (
            <div className="flex items-center gap-2">
              {/* 사유를 남길 기여 로그가 이 원장에는 아직 없으므로 확인창만 띄운다(PROGRAM과 같다). */}
              <DetailDeleteButton
                name={record.name}
                withReason={false}
                onDelete={() => remove.mutateAsync(record.id)}
                onDeleted={() => navigate(MA_BUYER_BASE_PATH)}
              />
              <Button onClick={() => setEditing(true)}>수정</Button>
            </div>
          )}
        </div>
      )}

      {editing ? (
        <MaBuyerForm
          recordId={isNew ? undefined : id}
          initial={isNew ? null : (record ?? null)}
          backTo={MA_BUYER_BASE_PATH}
          onDone={({ id: newId }) => {
            setEditing(false)
            if (isNew) navigate(`${MA_BUYER_BASE_PATH}/${newId}`)
          }}
          onCancel={() => (isNew ? navigate(MA_BUYER_BASE_PATH) : setEditing(false))}
        />
      ) : (
        record && <MaBuyerView record={record} />
      )}
    </div>
  )
}
