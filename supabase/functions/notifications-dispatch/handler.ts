// 알림 발송 일반 창구 — 쓰지 않으므로 닫아 둡니다(SEC-1).
//
// 종전에는 요청 본문의 `to`·`templateCode`·`variables`를 그대로 발송기에 넘겨, 유효한 토큰
// 하나면 임의 수신처에 회사 명의 안내(호출자가 링크를 정하는 재설정 문안 포함)를 요청할 수
// 있었습니다. 저장소에 호출자가 없고 공급자 어댑터도 없어 닫아서 잃는 전달 경로가 없습니다.
//
// 다시 열려면 수신처·본문을 서버가 승인된 원장에서 유도하고, 발송 권한을 읽기 권한과 별도로
// 판정하며, 재생 통제를 갖춘 계약이 먼저 있어야 합니다.
//
// `_shared/notifications.ts`와 그것을 쓰는 guest-access-invite·guest-password-reset은 그대로입니다.
// 경위와 현재 상태는 docs/SECURITY_REVIEW.md F-1.
import { jsonResponse } from '../_shared/cors.ts'

const DISABLED = {
  error: 'endpoint_disabled',
  message: '알림 발송 일반 창구는 사용하지 않습니다.',
} as const

export function handleNotificationsDispatch(req: Request): Response {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)
  return jsonResponse(DISABLED, 403)
}
