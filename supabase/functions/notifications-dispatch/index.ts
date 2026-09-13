// 알림 발송 일반 창구 — 닫혀 있습니다. 사유와 재개 조건은 handler.ts 머리글에 있습니다(SEC-1).
//
// 이 파일에는 배선만 남깁니다. 판정과 배선이 한 파일에 있으면 모듈을 여는 순간 서버가 서기
// 때문에 판정을 테스트에서 부를 수 없습니다(게스트 로그인·비밀번호 함수와 같은 모양입니다).
import { withCors } from '../_shared/cors.ts'
import { handleNotificationsDispatch } from './handler.ts'

Deno.serve(withCors(handleNotificationsDispatch))
