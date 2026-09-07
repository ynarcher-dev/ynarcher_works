import {
  BackButton,
  Badge,
  Banner,
  Button,
  CardShell,
  cardText,
  DensityProvider,
  EmptyState,
  InfoField,
  InfoGrid,
  PanelCard,
  RefLinkList,
  Spinner,
} from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DetailDeleteButton } from '@/components/DetailDeleteButton'
import { RichTextViewer } from '@/components/RichTextEditor'
import { MaBuyerForm } from '@/features/mna/buyers/MaBuyerForm'
import {
  MA_BUYER_BASE_PATH,
  MA_BUYER_CONTENT_KEY,
  MA_BUYER_NOUN,
  MA_BUYER_TARGET_TYPE,
  toMillion,
  type MaBuyerRow,
} from '@/features/mna/buyers/config'
import {
  useDeleteMaBuyer,
  useMaBuyerContributions,
  useMaBuyerRecord,
} from '@/features/mna/buyers/hooks'
import { SensitiveValue } from '@/features/master/SensitiveValue'
import { ChangeHistoryPanel } from '@/features/networks/ChangeHistoryPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { RelatedMinutesPanel } from '@/features/office/minutes/RelatedMinutesPanel'
import type { MinuteLinkTargetType } from '@/features/office/minutes/minuteLinks'

function formatDate(v: string | null | undefined): string {
  return v && v.length >= 10 ? v.slice(0, 10) : '-'
}

/**
 * 조회 뷰 — 좌측 2/3에 본문, 우측 1/3에 곁다리 패널 넷.
 *
 * 배치는 NETWORKS·STARTUP 상세와 같다. 우측 넷이 답하는 것은 레코드의 값이 아니라 그 레코드를
 * 둘러싼 것들(붙은 자료·다룬 회의·누가 고쳤나·무슨 말이 오갔나)이라, 원장이 달라도 같은 자리에
 * 같은 순서로 서야 화면을 옮겨도 손이 같은 곳을 찾는다.
 */
function MaBuyerView({ record }: { record: MaBuyerRow }) {
  const industries = Array.isArray(record.industries) ? record.industries : []
  const overview = record.overview_html ?? ''
  const { data: contributions } = useMaBuyerContributions(record.id)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <CardShell>
          {/* 헤더 규격은 STARTUP 상세와 같다 — 이름 줄에 분야 배지, 그 아래 한 줄 부제.
              상세 헤더는 카드 안에 있어도 페이지 맥락이라 밀도를 올린다: card 밀도를 그대로
              두면 24px 제목 옆 배지가 11px로 찍혀 먼지처럼 보인다. */}
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
          {/* 희망사항이 이 원장의 한 줄 요약이다 — 기업명 바로 아래에서 '무엇을 찾는 곳인가'를
              먼저 답한다. 아래 정보행에 다시 적지 않는다(같은 값을 두 곳에 두면 어긋난다). */}
          <p className={`mt-1 ${cardText.subtitle}`}>{record.wish || '-'}</p>

          <div className="mt-5 border-t border-gray-100 pt-4">
            <InfoGrid>
              {/* 연결된 스타트업 원장 행. 상호참조는 배지가 아니라 텍스트 링크다 — 그 기업을
                  볼 권한이 없으면 임베드가 비어 오고, 그때 이 줄은 링크 없이 물러난다
                  (죽은 배지가 남지 않는다). */}
              <InfoField
                label="스타트업 DB"
                value={
                  <RefLinkList
                    as={Link}
                    items={
                      record.startup_id
                        ? [
                            {
                              key: record.startup_id,
                              label: record.startup?.name ?? '연결된 기업',
                              to: record.startup ? `/startup/discovered/${record.startup_id}` : null,
                              title: record.startup
                                ? undefined
                                : '이 기업을 열람할 권한이 없습니다.',
                            },
                          ]
                        : []
                    }
                    empty="연결 안 됨"
                  />
                }
              />
              <InfoField
                label="가용자금"
                value={
                  record.available_funds == null
                    ? '-'
                    : `${toMillion(record.available_funds)}백만원`
                }
              />
              {/* 바이어 쪽 창구다(우리 쪽 관리 주체가 아니다 — 이 원장은 영구 공동관리).
                  외부 인물의 개인정보라 마스킹 정책을 거치고, 원본 열람은 사유와 함께
                  access_logs에 남는다. */}
              <InfoField
                label="담당자"
                value={
                  <SensitiveValue
                    field="name"
                    contentKey={MA_BUYER_CONTENT_KEY}
                    value={record.contact_name ?? ''}
                    resourceType={MA_BUYER_TARGET_TYPE}
                    resourceId={record.id}
                  />
                }
              />
              <InfoField
                label="이메일"
                value={
                  <SensitiveValue
                    field="email"
                    contentKey={MA_BUYER_CONTENT_KEY}
                    value={record.contact_email ?? ''}
                    resourceType={MA_BUYER_TARGET_TYPE}
                    resourceId={record.id}
                  />
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

      {/* 우측(1/3): 자료 관리 → 관련 회의록 → 변동 이력 → 코멘트. */}
      <div className="space-y-4 lg:col-span-1">
        {/* 조회 화면의 자료는 읽기 전용이다 — 값을 바꾸는 입구는 '수정' 하나다. */}
        <MaterialPanel targetType={MA_BUYER_TARGET_TYPE} targetId={record.id} readOnly />
        <RelatedMinutesPanel
          targetType={MA_BUYER_TARGET_TYPE as MinuteLinkTargetType}
          targetId={record.id}
        />
        <ChangeHistoryPanel contributions={contributions} />
        <FeedbackPanel targetType={MA_BUYER_TARGET_TYPE} targetId={record.id} />
      </div>
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
              {/* 사유는 원장 컬럼이 아니라 변동 이력의 note로 남는다(deactivate_entity RPC). */}
              <DetailDeleteButton
                name={record.name}
                onDelete={(reason) =>
                  remove.mutateAsync({ id: record.id, reason: reason ?? '' })
                }
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
