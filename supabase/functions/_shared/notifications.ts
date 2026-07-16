// [Phase 14] 알림 채널 디스패처(알림톡/SMS/이메일)
// 프로바이더 어댑터 인터페이스로 추상화한다. 실제 프로바이더 키가 없으면 로그 폴백.
// 프로바이더 확정 시 env(KAKAO_ALIMTALK_KEY / SMS_API_KEY / EMAIL_API_KEY)로 주입한다.

export type Channel = 'ALIMTALK' | 'SMS' | 'EMAIL'

export interface NotificationRequest {
  channel: Channel
  to: string
  templateCode: string
  variables?: Record<string, string>
}

// 템플릿 레지스트리(코드 → 채널별 본문). {{var}} 치환.
export const TEMPLATES: Record<
  string,
  { title?: string; body: string }
> = {
  GUEST_OTP: {
    title: '[와이앤아처] 인증번호',
    body: '인증번호 [{{otp}}]를 3분 이내 입력해 주세요.',
  },
  APPROVAL_REQUESTED: {
    title: '[와이앤아처] 결재 요청',
    body: '{{drafter}}님이 상신한 "{{title}}" 문서의 결재를 요청했습니다.',
  },
  APPROVAL_RESULT: {
    title: '[와이앤아처] 결재 결과',
    body: '"{{title}}" 문서가 {{result}} 처리되었습니다.',
  },
  CAPITAL_CALL_DUE: {
    title: '[와이앤아처] 캐피탈 콜 안내',
    body: '{{fund}} {{callNo}}차 캐피탈 콜(납입기한 {{dueDate}}) 안내드립니다.',
  },
  BOOKING_CONFIRMED: {
    title: '[와이앤아처] 예약 확정',
    body: '{{when}} 멘토링 미팅 예약이 확정되었습니다.',
  },
}

function render(template: string, vars: Record<string, string> = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? '')
}

/** 로컬 Supabase 스택 여부(로컬만 http). 운영/호스팅 환경은 항상 https. */
function isLocalStack(): boolean {
  return (Deno.env.get('SUPABASE_URL') ?? '').startsWith('http://')
}

/**
 * 단일 알림 발송.
 * 프로바이더 미설정 시: 로컬 스택에서만 콘솔 로그 폴백을 성공으로 처리한다.
 * 운영(https) 환경에서 키가 없으면 실패를 반환한다 — OTP 등 인증성 메시지가
 * "발송된 척" 성공 처리되는 것을 차단한다(P1-4.3).
 */
export async function sendNotification(
  req: NotificationRequest,
): Promise<{ ok: boolean; provider: string }> {
  const tpl = TEMPLATES[req.templateCode]
  if (!tpl) throw new Error(`unknown_template:${req.templateCode}`)
  const body = render(tpl.body, req.variables)

  const providerKey =
    req.channel === 'ALIMTALK'
      ? Deno.env.get('KAKAO_ALIMTALK_KEY')
      : req.channel === 'SMS'
        ? Deno.env.get('SMS_API_KEY')
        : Deno.env.get('EMAIL_API_KEY')

  if (!providerKey) {
    if (isLocalStack()) {
      // 로컬 개발: OTP 확인이 필요하므로 본문을 그대로 로그에 남긴다.
      console.log(`[notify:${req.channel}→${req.to}] ${tpl.title ?? ''} ${body}`)
      return { ok: true, provider: 'log' }
    }
    // 운영: OTP 원문을 로그에 남기지 않고 발송 실패로 처리한다.
    console.error(`[notify:${req.channel}] provider key missing — dispatch failed (${req.templateCode})`)
    return { ok: false, provider: 'none' }
  }

  // TODO(프로바이더 확정): 채널별 실제 API 호출 어댑터 연결.
  //  - ALIMTALK: 카카오 알림톡(사업자 발신 프로파일 + 템플릿 사전 승인)
  //  - SMS: 국내 SMS 게이트웨이
  //  - EMAIL: 트랜잭션 메일 프로바이더
  console.log(`[notify:${req.channel}] provider configured, dispatch stub`)
  return { ok: true, provider: req.channel.toLowerCase() }
}
