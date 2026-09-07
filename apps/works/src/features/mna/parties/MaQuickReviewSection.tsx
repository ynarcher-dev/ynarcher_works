import { EmptyState } from '@ynarcher/ui'
import { SectionHeading } from '@/components/SectionHeading'
import { isQuickReviewEmpty, readQuickReview } from '@/features/mna/parties/quickReview'
import { MaQuickReviewNarrative } from '@/features/mna/parties/MaQuickReviewNarrative'
import { MaQuickReviewFinancials } from '@/features/mna/parties/MaQuickReviewFinancials'

/**
 * 조회 화면의 퀵 리뷰 밴드 — 상세내용 **아래**에 선다.
 *
 * 자리가 아래인 이유는 순서다. 상세내용은 담당자가 손으로 적은 메모(매각 배경·미팅에서 들은
 * 말)이고 퀵 리뷰는 자료에서 정리된 문서라, 먼저 읽어야 할 것은 "왜 이 건을 보고 있는가"다.
 * 문서를 위에 두면 일곱 절이 화면을 채워 그 한 줄이 스크롤 아래로 밀린다.
 *
 * **밴드가 통째로 비면 한 줄로 접는다.** 절마다 빈 문구를 세우면 안내문 일곱 줄의 벽이 되고,
 * 그때 화면은 "아직 안 만들었다"가 아니라 "만들었는데 부실하다"로 읽힌다. 하나라도 차 있으면
 * 찬 절만 서고 빈 절은 서지 않는다(STARTUP 상세의 밴드 규칙과 같다).
 *
 * 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md
 */
export function MaQuickReviewSection({ raw }: { raw: unknown }) {
  const qr = readQuickReview(raw)

  return (
    <section className="space-y-4">
      {/* 밴드 제목은 카드 밖에 선다 — 카드 제목과 같은 층에 두면 '퀵 리뷰'가 그 아래 일곱 절
          중 하나로 읽힌다. 규격은 화면이 아니라 공용 `SectionHeading`이 소유한다
          (스타트업 상세의 역량·실적 밴드와 같은 부품이다). */}
      <SectionHeading title="퀵 리뷰" accent />
      {isQuickReviewEmpty(qr) ? (
        <EmptyState
          title="아직 작성된 퀵 리뷰가 없습니다."
          description="수정에서 직접 적거나, 자료를 첨부한 뒤 ‘AI 작성하기’로 초안을 만들 수 있습니다."
        />
      ) : (
        <>
          <MaQuickReviewNarrative qr={qr} />
          <MaQuickReviewFinancials qr={qr} />
        </>
      )}
    </section>
  )
}
