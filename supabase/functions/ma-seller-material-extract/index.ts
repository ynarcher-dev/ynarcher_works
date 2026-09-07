// [M&A 셀러 자료 분석] 첨부 한 건 → 조각 → 캐시 원장(`attachment_extracts`)
// 요청: POST { targetId?, attachmentId?, source: 'file'|'link', parserVersion, fileName, mime,
//              byteSize, contentHash?, url?, result? }
// 응답: { status, summary, reason, body, analyzedAt } | 4xx/5xx
//
// **이 파일은 프로파일 하나를 골라 엔진에 넘기는 일만 한다.** 여는 일과 저장하는 일은 대상을
// 모르므로 `_shared/aiFill/extractRun.ts`가 갖고, 이 대상의 쓰기 자격은
// `../ma-seller-quick-review/profile.ts`가 답한다.
//
// **STARTUP 함수를 같이 쓰지 않는다.** 캐시 원장은 첨부 id로 갈리니 공유해도 될 것 같지만,
// 이 함수가 하는 첫 일이 **호출자의 쓰기 자격을 묻는 것**이고 그 물음은 대상마다 다르다
// (can_write_ma_seller vs can_write_startup). 하나로 합치면 셀러 자료를 여는 요청이 스타트업
// 쓰기 권한으로 판정되고, 어느 원장에서 난 일인지 로그도 답하지 못한다.
//
// 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md
import { withCors } from '../_shared/cors.ts'
import { runMaterialExtract } from '../_shared/aiFill/extractRun.ts'
import { maSellerQuickReviewProfile } from '../ma-seller-quick-review/profile.ts'

Deno.serve(withCors((req: Request) => runMaterialExtract(req, maSellerQuickReviewProfile)))
