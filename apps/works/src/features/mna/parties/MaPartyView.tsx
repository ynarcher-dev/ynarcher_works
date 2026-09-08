import {
  Badge,
  EmptyState,
  EntityHeaderCard,
  InfoField,
  InfoGrid,
  PanelCard,
} from '@ynarcher/ui'
import { RichTextViewer } from '@/components/RichTextEditor'
import { MaQuickReviewSection } from '@/features/mna/parties/MaQuickReviewSection'
import {
  decisionBadge,
  toWon,
  type MaPartyConfig,
  type MaPartyRow,
} from '@/features/mna/parties/config'
import { useMaPartyContributions } from '@/features/mna/parties/hooks'
import { SensitiveValue } from '@/features/master/SensitiveValue'
import { ChangeHistoryPanel } from '@/features/networks/ChangeHistoryPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { RelatedMinutesPanel } from '@/features/office/minutes/RelatedMinutesPanel'
import type { MinuteLinkTargetType } from '@/features/office/minutes/minuteLinks'

/**
 * 날짜 한 칸. 값이 없으면 하이픈을 직접 찍지 않고 `null`을 돌려준다 — 빈 값의 글자와 색은
 * `InfoField`가 `EmptyValue`에 맡겨 한곳에서 정한다. 직접 찍으면 값과 같은 진한 톤이 되어
 * '수정일: -'가 실제 값만큼 무겁게 읽힌다.
 */
function formatDate(v: string | null | undefined): string | null {
  return v && v.length >= 10 ? v.slice(0, 10) : null
}

/**
 * 조회 뷰 — 좌측 2/3에 본문, 우측 1/3에 곁다리 패널 넷.
 *
 * 배치는 NETWORKS·STARTUP 상세와 같다. 우측 넷이 답하는 것은 레코드의 값이 아니라 그 레코드를
 * 둘러싼 것들(붙은 자료·다룬 회의·누가 고쳤나·무슨 말이 오갔나)이라, 원장이 달라도 같은 자리에
 * 같은 순서로 서야 화면을 옮겨도 손이 같은 곳을 찾는다.
 */
export function MaPartyView({
  config,
  record,
}: {
  config: MaPartyConfig
  record: MaPartyRow
}) {
  const industries = Array.isArray(record.industries) ? record.industries : []
  const decision = decisionBadge(record.decision)
  const overview = record.overview_html ?? ''
  const { data: contributions } = useMaPartyContributions(config, record.id)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {/* 헤더 규격(제목·배지·부제·구분선·정보행)은 화면이 아니라 공용 `EntityHeaderCard`가
            소유한다 — STARTUP·NETWORKS·FUND 상세와 같은 카드다.

            부제 자리에 희망사항을 두는 것은 이 원장의 한 줄 요약이기 때문이다 — 기업명 바로
            아래에서 '무엇을 찾는 곳인가'를 먼저 답한다. 아래 정보행에 다시 적지 않는다(같은
            값을 두 곳에 두면 어긋난다). */}
        <EntityHeaderCard
          title={record.name}
          badges={
            <>
              {/* 진행여부가 분야보다 앞선다 — 이름 다음에 답해야 하는 것은 '무엇을 하는
                  곳인가'가 아니라 '이 건을 할 것인가'다. 결정이 없어도 자리를 비우지 않고
                  중립 '미결정'으로 세운다(목록의 같은 열과 같은 처리).

                  색이 붙는 배지는 이 하나뿐이라 분야 배지와 섞이지 않는다 — 색은 상태에만
                  쓴다는 규칙(§3.4)이 여기서 그대로 두 종류를 갈라 준다. */}
              <Badge tone={decision.tone}>{decision.label}</Badge>
              {industries.map((ind) => (
                <Badge key={ind} tone="neutral">
                  {ind}
                </Badge>
              ))}
            </>
          }
          description={record.wish}
          info={
            <InfoGrid>
              <InfoField
                label={config.fundsLabel}
                // 상세는 원 단위다 — 한 건을 정확히 읽는 자리라 반올림이 끼면 안 된다.
                // 목록은 백만원인데(자릿수를 짧게 해 세로로 견주는 자리), 단위가 갈리는 것은
                // 자리마다 하는 일이 달라서이고 저장값은 원 하나다.
                value={
                  record.available_funds == null ? null : `${toWon(record.available_funds)}원`
                }
              />
              {/* 상대 쪽 창구다(우리 쪽 관리 주체가 아니다 — 이 원장은 영구 공동관리).
                  외부 인물의 개인정보라 마스킹 정책을 거치고, 원본 열람은 사유와 함께
                  access_logs에 남는다. */}
              <InfoField
                label="담당자"
                value={
                  <SensitiveValue
                    field="name"
                    contentKey={config.contentKey}
                    value={record.contact_name ?? ''}
                    resourceType={config.targetType}
                    resourceId={record.id}
                  />
                }
              />
              <InfoField
                label="이메일"
                value={
                  <SensitiveValue
                    field="email"
                    contentKey={config.contentKey}
                    value={record.contact_email ?? ''}
                    resourceType={config.targetType}
                    resourceId={record.id}
                  />
                }
              />
              {/* 레코드 자체의 값이 아니라 레코드를 다룬 흔적이라 한 단 연한 톤으로 물러난다
                  (`InfoField`의 `meta` — STARTUP·NETWORKS 상세와 같은 처리). */}
              <InfoField label="생성자" value={record.creator?.name || null} meta />
              <InfoField label="등록일" value={formatDate(record.created_at)} meta />
              <InfoField label="수정일" value={formatDate(record.updated_at)} meta />
            </InfoGrid>
          }
        />

        {/* 본문이 이 원장의 몸통이다 — 칸이 아니라 여기가 대부분의 내용을 갖는다.
            높이는 글자 길이가 정한다(2026-09-07) — 뷰어에 최소 높이를 주던 규칙을 걷었다.
            한 줄짜리 메모가 열 줄짜리와 같은 크기로 서면 카드 크기가 내용의 많고 적음을
            말하지 못한다(global.css의 `.rte` 규칙 참조). */}
        <PanelCard title="상세내용">
          {overview ? (
            <RichTextViewer html={overview} />
          ) : (
            <EmptyState
              title="아직 작성된 상세내용이 없습니다."
              description="수정에서 배경·희망 조건·미팅 메모를 적을 수 있습니다."
            />
          )}
        </PanelCard>

        {/* 퀵 리뷰는 상세내용 아래에 선다 — 먼저 읽어야 할 것은 "왜 이 건을 보고 있는가"이고,
            문서를 위에 두면 일곱 절이 그 한 줄을 스크롤 아래로 밀어낸다. */}
        {config.hasQuickReview && <MaQuickReviewSection raw={record.quick_review} />}
      </div>

      {/* 우측(1/3): 자료 관리 → 관련 회의록 → 변동 이력 → 코멘트. */}
      <div className="space-y-4 lg:col-span-1">
        {/* 조회 화면의 자료는 읽기 전용이다 — 값을 바꾸는 입구는 '수정' 하나다. */}
        <MaterialPanel targetType={config.targetType} targetId={record.id} readOnly />
        <RelatedMinutesPanel
          targetType={config.targetType as MinuteLinkTargetType}
          targetId={record.id}
        />
        <ChangeHistoryPanel contributions={contributions} />
        <FeedbackPanel targetType={config.targetType} targetId={record.id} />
      </div>
    </div>
  )
}
