/**
 * 거래처 등록·수정 폼의 값 모델과 규칙 — 화면(JSX)과 떼어 두고 여기서만 판단한다.
 *
 * 규칙은 DB check 제약(20260903210000_trade_partners.sql)을 그대로 비춘 것이다. 서버가 최종
 * 판정하지만 저장을 눌러서야 알게 되면 무엇이 틀렸는지 사용자가 알 수 없으므로 같은 규칙을
 * 화면 쪽에도 둔다. 둘이 어긋나면 DB가 맞다.
 *
 * 한 칸(등록번호)이 구분에 따라 다른 값을 받는다 — 법인은 사업자등록번호 10자리, 개인은
 * 생년월일 8자리다. 칸을 둘로 나누지 않는 이유는 어느 쪽이든 한 거래처에 하나뿐이라, 나누면
 * 언제나 한 칸이 비어 있고 그 빈 칸이 "아직 안 적었다"인지 "여기 적을 값이 아니다"인지
 * 구분되지 않기 때문이다. 대신 라벨·자릿수·검증이 구분을 따라 함께 갈린다.
 */
import {
  PARTNER_TYPE_LABELS,
  registrationLabel,
  type PartnerType,
} from '@/features/management/partners/config'
import type { TradePartner, TradePartnerInput } from '@/features/management/partners/partnersApi'

/** 폼이 들고 있는 값. 번호류는 입력 중간 상태를 담기 위해 문자열로 둔다. */
export interface PartnerDraft {
  /** 코드 접두어(영문 2글자). 등록에만 쓰이며 일련번호는 서버가 매긴다. */
  codePrefix: string
  name: string
  partnerType: PartnerType
  /** 숫자만. 법인 10자리 / 개인 8자리. 빈 문자열이면 미입력. */
  registrationNo: string
  /** 금융기관 코드 3자리. 빈 문자열이면 미선택. */
  bankCode: string
  accountNo: string
  accountHolder: string
  licensePath: string
  licenseName: string
  bankbookPath: string
  bankbookName: string
  isActive: boolean
}

export interface PartnerFormError {
  /** 강조할 필드(폼이 invalid 표시에 쓴다). */
  field: keyof PartnerDraft
  message: string
}

export function emptyPartnerDraft(): PartnerDraft {
  return {
    codePrefix: '',
    name: '',
    partnerType: 'CORPORATE',
    registrationNo: '',
    bankCode: '',
    accountNo: '',
    accountHolder: '',
    licensePath: '',
    licenseName: '',
    bankbookPath: '',
    bankbookName: '',
    isActive: true,
  }
}

export function draftFromPartner(p: TradePartner): PartnerDraft {
  return {
    codePrefix: p.codePrefix,
    name: p.name,
    partnerType: p.partnerType,
    registrationNo: p.registrationNo ?? '',
    bankCode: p.bankCode ?? '',
    accountNo: p.accountNo ?? '',
    accountHolder: p.accountHolder ?? '',
    licensePath: p.licensePath ?? '',
    licenseName: p.licenseName ?? '',
    bankbookPath: p.bankbookPath ?? '',
    bankbookName: p.bankbookName ?? '',
    isActive: p.isActive,
  }
}

/**
 * 구분 변경 — 등록번호를 비운다.
 *
 * 남겨 두면 사업자등록번호가 생년월일 칸에 그대로 서서, 자릿수 검증에 걸릴 때까지 사용자는
 * 그 값이 옳다고 읽는다. 서류 첨부는 비우지 않는다 — 파일은 이미 올라가 있고, 잘못 붙인
 * 것이라면 그 자리에서 지우면 된다(값과 달리 무엇이 붙어 있는지가 화면에 그대로 보인다).
 */
export function withPartnerType(draft: PartnerDraft, partnerType: PartnerType): PartnerDraft {
  if (draft.partnerType === partnerType) return draft
  return { ...draft, partnerType, registrationNo: '' }
}

/** 숫자만 남긴다(하이픈이 든 채로 붙여 넣어도 그대로 받는다). */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/** 계좌번호 입력 — 숫자와 하이픈만 남긴다(구분 기호는 은행마다 달라 그대로 둔다). */
export function normalizeAccountNo(value: string): string {
  return value.replace(/[^\d-]/g, '')
}

/** 코드 접두어 입력 — 영문 2글자 대문자. */
export function normalizeCodePrefix(value: string): string {
  return value.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()
}

/**
 * 사업자등록번호 검증(국세청 검증 규칙).
 *
 * 자릿수만 보면 오타를 잡지 못한다 — 열 자리 중 한 자리를 잘못 친 번호도 열 자리다.
 * 마지막 한 자리가 앞의 아홉 자리에서 계산되는 값이라, 이 계산으로 대부분의 오타가 걸린다.
 */
export function isValidBusinessNo(value: string): boolean {
  const digits = digitsOnly(value)
  if (digits.length !== 10) return false
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5]
  const nums = [...digits].map(Number)
  let sum = nums.slice(0, 9).reduce((acc, n, i) => acc + n * weights[i]!, 0)
  sum += Math.floor((nums[8]! * 5) / 10)
  return (10 - (sum % 10)) % 10 === nums[9]
}

/** 생년월일 8자리 검증 — 실재하는 날짜이고 미래가 아니어야 한다. */
export function isValidBirthDate(value: string): boolean {
  const digits = digitsOnly(value)
  if (!/^\d{8}$/.test(digits)) return false
  const year = Number(digits.slice(0, 4))
  const month = Number(digits.slice(4, 6))
  const day = Number(digits.slice(6, 8))
  if (year < 1900) return false
  const d = new Date(Date.UTC(year, month - 1, day))
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return false
  }
  return d.getTime() <= Date.now()
}

/** 표시용 등록번호 — 법인 `123-45-67890`, 개인 `1990-01-01`. 값이 없으면 null. */
export function formatRegistrationNo(
  type: PartnerType,
  value: string | null,
): string | null {
  const digits = digitsOnly(value ?? '')
  if (!digits) return null
  if (type === 'CORPORATE' && digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
  }
  if (type === 'INDIVIDUAL' && digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
  }
  // 자릿수가 어긋난 값(과거 데이터)은 손대지 않고 그대로 적는다 — 꾸며 놓으면 틀린 줄 모른다.
  return digits
}

/** 그 구분에서 등록번호가 몇 자리인가. 입력 상한(maxLength)과 검증이 함께 쓴다. */
export function registrationLength(type: PartnerType): number {
  return type === 'CORPORATE' ? 10 : 8
}

/**
 * 저장 전 검증. 첫 번째로 어긋난 규칙 하나만 돌려준다 — 한 번에 여러 줄을 읽게 하지 않는다.
 * `editing`이면 코드 접두어를 보지 않는다(코드는 발급 후 바뀌지 않으므로 폼에 없다).
 */
export function validatePartnerDraft(
  draft: PartnerDraft,
  editing: boolean,
): PartnerFormError | null {
  if (!editing && !/^[A-Z]{2}$/.test(draft.codePrefix)) {
    return { field: 'codePrefix', message: '코드 접두어는 영문 2글자로 입력하세요.' }
  }
  if (!draft.name.trim()) {
    return { field: 'name', message: '거래처명을 입력하세요.' }
  }

  const reg = digitsOnly(draft.registrationNo)
  const label = registrationLabel(draft.partnerType)
  if (reg) {
    if (reg.length !== registrationLength(draft.partnerType)) {
      return {
        field: 'registrationNo',
        message: `${PARTNER_TYPE_LABELS[draft.partnerType]} 거래처의 ${label}는 ${registrationLength(draft.partnerType)}자리입니다.`,
      }
    }
    if (draft.partnerType === 'CORPORATE' && !isValidBusinessNo(reg)) {
      return { field: 'registrationNo', message: '사업자등록번호를 다시 확인하세요.' }
    }
    if (draft.partnerType === 'INDIVIDUAL' && !isValidBirthDate(reg)) {
      return { field: 'registrationNo', message: '생년월일을 YYYYMMDD 8자리로 확인하세요.' }
    }
  }

  // 계좌는 세 값이 함께 선다. 하나라도 적었다면 나머지도 있어야 이체에 쓸 수 있다.
  const filled = [draft.bankCode, draft.accountNo.trim(), draft.accountHolder.trim()].filter(
    Boolean,
  ).length
  if (filled > 0 && filled < 3) {
    if (!draft.bankCode) return { field: 'bankCode', message: '은행을 선택하세요.' }
    if (!draft.accountNo.trim()) {
      return { field: 'accountNo', message: '계좌번호를 입력하세요.' }
    }
    return { field: 'accountHolder', message: '예금주를 입력하세요.' }
  }
  if (draft.accountNo.trim() && !/^\d[\d-]{4,29}$/.test(draft.accountNo.trim())) {
    return { field: 'accountNo', message: '계좌번호는 숫자와 하이픈으로 입력하세요.' }
  }

  return null
}

/** 저장 입력으로 변환. 빈 문자열은 모두 null로 접는다(DB에서 ''와 null을 구분할 이유가 없다). */
export function toPartnerInput(draft: PartnerDraft): TradePartnerInput {
  const account = draft.accountNo.trim()
  const holder = draft.accountHolder.trim()
  const hasAccount = Boolean(draft.bankCode && account && holder)
  return {
    codePrefix: draft.codePrefix,
    name: draft.name.trim(),
    partnerType: draft.partnerType,
    registrationNo: digitsOnly(draft.registrationNo) || null,
    // 세 값은 함께 저장되거나 함께 비워진다(DB check와 같은 규칙).
    bankCode: hasAccount ? draft.bankCode : null,
    accountNo: hasAccount ? account : null,
    accountHolder: hasAccount ? holder : null,
    licensePath: draft.licensePath || null,
    licenseName: draft.licenseName || null,
    bankbookPath: draft.bankbookPath || null,
    bankbookName: draft.bankbookName || null,
    isActive: draft.isActive,
  }
}
