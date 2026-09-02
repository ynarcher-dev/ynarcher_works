import { describe, expect, it } from 'vitest'
import {
  digitsOnly,
  draftFromPartner,
  emptyPartnerDraft,
  formatRegistrationNo,
  isValidBirthDate,
  isValidBusinessNo,
  normalizeAccountNo,
  normalizeCodePrefix,
  toPartnerInput,
  validatePartnerDraft,
  withPartnerType,
  type PartnerDraft,
} from '@/features/management/partners/partnerForm'
import type { TradePartner } from '@/features/management/partners/partnersApi'

/**
 * 거래처 폼 규칙은 DB check 제약(20260903210000)을 비춘 것이다 — 여기 사례가 곧 "저장이
 * 거부되는 조합"의 목록이며 기획서 3_7_4 §11(검증 규칙)과 같은 것을 본다.
 *
 * `1234567891`은 검증식을 만족하는 사업자등록번호다(앞 9자리에서 마지막 한 자리가 나온다).
 */
const VALID_BIZ_NO = '1234567891'

function draft(over: Partial<PartnerDraft> = {}): PartnerDraft {
  return { ...emptyPartnerDraft(), codePrefix: 'YN', name: '와이앤아처', ...over }
}

describe('validatePartnerDraft', () => {
  it('필수값만 채운 초안은 통과한다', () => {
    expect(validatePartnerDraft(draft(), false)).toBeNull()
  })

  it('등록 시 코드 접두어가 영문 2글자가 아니면 막는다', () => {
    expect(validatePartnerDraft(draft({ codePrefix: '' }), false)?.field).toBe('codePrefix')
    expect(validatePartnerDraft(draft({ codePrefix: 'Y' }), false)?.field).toBe('codePrefix')
  })

  it('수정 시에는 코드 접두어를 보지 않는다(코드는 발급 후 불변)', () => {
    expect(validatePartnerDraft(draft({ codePrefix: '' }), true)).toBeNull()
  })

  it('거래처명은 공백만으로 채울 수 없다', () => {
    expect(validatePartnerDraft(draft({ name: '   ' }), false)?.field).toBe('name')
  })

  it('법인은 사업자등록번호 10자리를 받는다', () => {
    expect(validatePartnerDraft(draft({ registrationNo: VALID_BIZ_NO }), false)).toBeNull()
    expect(validatePartnerDraft(draft({ registrationNo: '12345678' }), false)?.field).toBe(
      'registrationNo',
    )
  })

  it('자릿수가 맞아도 검증식에 어긋난 사업자등록번호는 막는다', () => {
    const found = validatePartnerDraft(draft({ registrationNo: '1234567890' }), false)
    expect(found?.field).toBe('registrationNo')
  })

  it('개인은 생년월일 8자리를 받고 실재하지 않는 날짜는 막는다', () => {
    const person = { partnerType: 'INDIVIDUAL' as const }
    expect(validatePartnerDraft(draft({ ...person, registrationNo: '19900101' }), false)).toBeNull()
    expect(
      validatePartnerDraft(draft({ ...person, registrationNo: '19900230' }), false)?.field,
    ).toBe('registrationNo')
  })

  it('등록번호는 비워 둘 수 있다(아직 서류를 못 받은 거래처)', () => {
    expect(validatePartnerDraft(draft({ registrationNo: '' }), false)).toBeNull()
  })

  it('계좌 세 값 중 하나만 적으면 나머지를 요구한다', () => {
    expect(validatePartnerDraft(draft({ bankCode: '004' }), false)?.field).toBe('accountNo')
    expect(validatePartnerDraft(draft({ accountNo: '123-456' }), false)?.field).toBe('bankCode')
    expect(
      validatePartnerDraft(draft({ bankCode: '004', accountNo: '123-456' }), false)?.field,
    ).toBe('accountHolder')
  })

  it('계좌 세 값이 모두 있으면 통과한다', () => {
    const found = validatePartnerDraft(
      draft({ bankCode: '004', accountNo: '349401-04-350803', accountHolder: '와이앤아처(주)' }),
      false,
    )
    expect(found).toBeNull()
  })

  it('계좌번호에 숫자·하이픈 외의 글자가 있으면 막는다', () => {
    const found = validatePartnerDraft(
      draft({ bankCode: '004', accountNo: '계좌 없음', accountHolder: '홍길동' }),
      false,
    )
    expect(found?.field).toBe('accountNo')
  })
})

describe('withPartnerType', () => {
  it('구분이 바뀌면 등록번호를 비운다(같은 칸이 다른 값을 받는다)', () => {
    const next = withPartnerType(draft({ registrationNo: VALID_BIZ_NO }), 'INDIVIDUAL')
    expect(next.registrationNo).toBe('')
    expect(next.partnerType).toBe('INDIVIDUAL')
  })

  it('같은 구분을 다시 고르면 초안을 그대로 둔다', () => {
    const before = draft({ registrationNo: VALID_BIZ_NO })
    expect(withPartnerType(before, 'CORPORATE')).toBe(before)
  })

  it('서류 첨부는 비우지 않는다', () => {
    const next = withPartnerType(
      draft({ licensePath: 'k', licenseName: '등록증.pdf' }),
      'INDIVIDUAL',
    )
    expect(next.licensePath).toBe('k')
  })
})

describe('isValidBusinessNo', () => {
  it('검증식을 만족하는 번호만 통과한다', () => {
    expect(isValidBusinessNo(VALID_BIZ_NO)).toBe(true)
    expect(isValidBusinessNo('123-45-67891')).toBe(true)
    expect(isValidBusinessNo('1234567890')).toBe(false)
    expect(isValidBusinessNo('123456789')).toBe(false)
  })
})

describe('isValidBirthDate', () => {
  it('실재하는 과거 날짜만 통과한다', () => {
    expect(isValidBirthDate('19900101')).toBe(true)
    expect(isValidBirthDate('20000229')).toBe(true) // 윤년
    expect(isValidBirthDate('19000229')).toBe(false) // 평년
    expect(isValidBirthDate('18991231')).toBe(false)
    expect(isValidBirthDate('20991231')).toBe(false) // 미래
    expect(isValidBirthDate('1990011')).toBe(false)
  })
})

describe('formatRegistrationNo', () => {
  it('구분에 따라 표기가 갈린다', () => {
    expect(formatRegistrationNo('CORPORATE', VALID_BIZ_NO)).toBe('123-45-67891')
    expect(formatRegistrationNo('INDIVIDUAL', '19900101')).toBe('1990-01-01')
  })

  it('값이 없으면 null, 자릿수가 어긋나면 손대지 않는다', () => {
    expect(formatRegistrationNo('CORPORATE', null)).toBeNull()
    expect(formatRegistrationNo('CORPORATE', '12345')).toBe('12345')
  })
})

describe('입력 정규화', () => {
  it('숫자만 남긴다', () => {
    expect(digitsOnly('123-45-67891')).toBe('1234567891')
  })

  it('계좌번호는 숫자와 하이픈만 남긴다', () => {
    expect(normalizeAccountNo('602-910435-43607 (하나)')).toBe('602-910435-43607')
  })

  it('코드 접두어는 영문 2글자 대문자로 자른다', () => {
    expect(normalizeCodePrefix('yn1')).toBe('YN')
    expect(normalizeCodePrefix('abc')).toBe('AB')
    expect(normalizeCodePrefix('12')).toBe('')
  })
})

describe('toPartnerInput', () => {
  it('빈 문자열을 null로 접고 등록번호는 숫자만 남긴다', () => {
    const v = toPartnerInput(draft({ registrationNo: '123-45-67891' }))
    expect(v.registrationNo).toBe(VALID_BIZ_NO)
    expect(v.bankCode).toBeNull()
    expect(v.licensePath).toBeNull()
  })

  it('계좌 세 값이 다 차 있을 때만 계좌를 저장한다', () => {
    const partial = toPartnerInput(draft({ bankCode: '004', accountNo: '123-456' }))
    expect(partial.bankCode).toBeNull()
    expect(partial.accountNo).toBeNull()

    const full = toPartnerInput(
      draft({ bankCode: '004', accountNo: '123-456', accountHolder: '홍길동' }),
    )
    expect(full.bankCode).toBe('004')
    expect(full.accountHolder).toBe('홍길동')
  })
})

describe('draftFromPartner', () => {
  it('원장의 null을 빈 문자열로 편다', () => {
    const partner: TradePartner = {
      id: 'p1',
      code: 'YN00001',
      codePrefix: 'YN',
      name: '미성OA시스템',
      partnerType: 'CORPORATE',
      registrationNo: null,
      bankCode: null,
      accountNo: null,
      accountHolder: null,
      licensePath: null,
      licenseName: null,
      bankbookPath: null,
      bankbookName: null,
      isActive: true,
      createdBy: null,
      updatedAt: null,
    }
    const d = draftFromPartner(partner)
    expect(d.registrationNo).toBe('')
    expect(d.codePrefix).toBe('YN')
    expect(d.isActive).toBe(true)
  })
})
