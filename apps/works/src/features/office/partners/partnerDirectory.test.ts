import { describe, expect, it } from 'vitest'
import {
  formatDirectoryRegistrationNo,
  formatMaskedAccountNo,
} from '@/features/office/partners/partnerDirectory'

/**
 * OFFICE 조회면에 오는 값은 이미 서버(뷰 trade_partners_directory)가 자른 것이다.
 * 여기서 보는 것은 "잘린 값을 어떻게 적는가"뿐이며, 별표는 값이 아니라 더 있다는 표시다.
 */
describe('formatDirectoryRegistrationNo', () => {
  it('법인은 원본이 오므로 평소 표기로 적는다', () => {
    expect(formatDirectoryRegistrationNo('CORPORATE', '1234567891')).toBe('123-45-67891')
  })

  it('개인은 연도만 오고 나머지 자리를 별표로 세운다', () => {
    expect(formatDirectoryRegistrationNo('INDIVIDUAL', '1990')).toBe('1990-**-**')
  })

  it('값이 없으면 null', () => {
    expect(formatDirectoryRegistrationNo('CORPORATE', null)).toBeNull()
    expect(formatDirectoryRegistrationNo('INDIVIDUAL', null)).toBeNull()
  })

  it('개인인데 연도보다 긴 값이 오면 꾸미지 않는다(뷰가 바뀐 경우)', () => {
    expect(formatDirectoryRegistrationNo('INDIVIDUAL', '19900101')).toBe('19900101')
  })
})

describe('formatMaskedAccountNo', () => {
  it('뒤 네 자리 앞에 별표를 세운다', () => {
    expect(formatMaskedAccountNo('3607')).toBe('****-3607')
  })

  it('계좌가 없으면 null', () => {
    expect(formatMaskedAccountNo(null)).toBeNull()
  })
})
