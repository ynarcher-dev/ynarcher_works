// [M&A 셀러 퀵 리뷰] 첨부 자료 → Gemini → 퀵 리뷰 절 초안(JSON)
// 요청(수정 모드, JSON): { targetId, attachmentIds: string[], cards: CardKey[], assignments }
// 요청(등록 모드, multipart): cards=<JSON 배열>, assignments=<JSON 객체>, files=<파일 여러 개>,
//                             fileKeys=<JSON 배열, files와 같은 순서>, links=<주소 여러 개>,
//                             extracts=<JSON 객체, 자료 키 → { name, body }>
// 응답: { cards, notes, evidence, skippedSources, failedCards, model, modelVersion, elapsedMs }
//       | 4xx/5xx
//
// **이 파일은 프로파일 하나를 골라 엔진에 넘기는 일만 한다.** 실행의 순서와 보안 규약은 전부
// `_shared/aiFill/run.ts`가 갖고, 이 대상의 규격은 `profile.ts`가 갖는다. 둘을 가른 기준은
// 하나 — *무엇을 뽑는가*는 프로파일, *어떻게 뽑는가*는 엔진이다.
//
// 함수를 대상마다 얇게 두는 이유는 권한을 묻는 함수가 대상마다 다르고, 함수 이름이 곧 감사
// 로그와 배포의 경계이기 때문이다. 한 함수가 여러 원장의 쓰기 자격을 판정하기 시작하면
// 어느 대상의 사고인지 로그가 답하지 못한다.
//
// 주의: IM·티저는 매각 측의 기밀 자료이므로 Gemini(외부 AI)로 전송된다는 점이 전제되어 있다
//       (모달에서 매번 동의를 받는다). ALLOWED_ORIGINS로 호출 origin을 제한할 것.
// 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md
import { withCors } from '../_shared/cors.ts'
import { runAiFill } from '../_shared/aiFill/run.ts'
import { isCardKey, maSellerQuickReviewProfile } from './profile.ts'

Deno.serve(withCors((req: Request) => runAiFill(req, maSellerQuickReviewProfile, isCardKey)))
