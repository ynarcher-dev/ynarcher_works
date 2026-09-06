// [STARTUP 자료 분석] 첨부 한 건 → 조각 → 캐시 원장(`attachment_extracts`)
// 요청: POST { targetId?, attachmentId?, source: 'file'|'link', parserVersion, fileName, mime,
//              byteSize, contentHash?, url?, result? }
// 응답: { status, summary, reason, body, analyzedAt } | 4xx/5xx
//
// **이 파일은 프로파일 하나를 골라 엔진에 넘기는 일만 한다**(2026-09-06). 여는 일과 저장하는
// 일은 대상을 모르므로 `_shared/aiFill/extractRun.ts`가 갖고, 이 대상의 쓰기 자격은
// `../startup-ai-fill/profile.ts`가 답한다.
//
// 함수를 대상마다 얇게 두는 이유는 작성 함수와 같다 — 권한을 묻는 함수가 대상마다 다르고,
// 함수 이름이 곧 로그와 배포의 경계이기 때문이다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.2·§16.16
import { withCors } from '../_shared/cors.ts'
import { runMaterialExtract } from '../_shared/aiFill/extractRun.ts'
import { startupProfile } from '../startup-ai-fill/profile.ts'

Deno.serve(withCors((req: Request) => runMaterialExtract(req, startupProfile)))
