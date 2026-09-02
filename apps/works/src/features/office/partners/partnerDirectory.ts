/**
 * OFFICE 거래처 조회면의 표시 규칙 — 가려진 값을 어떻게 적는가.
 *
 * 가리는 일 자체는 서버가 한다(뷰 `public.trade_partners_directory`). 여기 오는 값은 이미
 * 잘려 있고, 이 파일은 잘린 값을 사람이 읽는 모양으로 세울 뿐이다. 반대로 두면 — 원본을 받아
 * 화면에서 가리면 — 화면을 거치지 않는 경로에 원본이 그대로 열린다.
 *
 * 그래서 여기서는 **없는 자리를 별표로 채운다**. 별표는 "이 값이 더 있다"는 표시이지 값이
 * 아니다. 아무 표시 없이 `1990`이나 `3607`만 적으면 그것이 값의 전부인 줄로 읽힌다.
 */
import type { PartnerType } from '@/features/management/partners/config'
import { formatRegistrationNo } from '@/features/management/partners/partnerForm'

/**
 * 등록번호 표기. 법인은 원본이 그대로 오므로 평소 표기(`123-45-67890`)를 쓰고,
 * 개인은 연도 네 자리만 오므로 나머지를 별표로 세운다(`1990-**-**`).
 */
export function formatDirectoryRegistrationNo(
  type: PartnerType,
  value: string | null,
): string | null {
  if (!value) return null
  if (type === 'CORPORATE') return formatRegistrationNo(type, value)
  // 연도만 온 경우가 정상이다. 그보다 길면 뷰가 바뀐 것이므로 꾸미지 않고 그대로 적는다.
  return value.length === 4 ? `${value}-**-**` : value
}

/** 계좌번호 표기 — 뒤 네 자리 앞에 별표를 세운다. 계좌가 없으면 null이다. */
export function formatMaskedAccountNo(last4: string | null): string | null {
  if (!last4) return null
  return `****-${last4}`
}
