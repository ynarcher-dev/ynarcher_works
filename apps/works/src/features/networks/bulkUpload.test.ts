import { describe, expect, it } from 'vitest'
import {
  countRowsMissingCountry,
  foldFileDuplicates,
  guessCountryName,
  parseBulkCsv,
  requireCountryTagId,
} from '@/features/networks/bulkUpload'

/** 리멤버 명함첩 헤더 그대로. 우리 표준 헤더와 이름이 하나도 같지 않다. */
const REMEMBER_HEADER =
  '회사,이름,부서,직함,전자 메일 주소,근무지 주소 번지,근무처 전화,근무처 팩스,휴대폰,명함 등록일,명함첩 이름,그룹,메모'

const remember = (...rows: string[]) => [REMEMBER_HEADER, ...rows].join('\n')

describe('parseBulkCsv — 리멤버 명함첩', () => {
  it('전자 메일 주소를 이메일로 읽는다 — 이 별칭이 없으면 이메일이 통째로 유실된다', () => {
    const [row] = parseBulkCsv(
      remember('포스코기술투자,김성욱,전략투자실,투자심사역,skim@example.com,서울,02-1,02-2,010-3153-9039,2026년 07월 01일,개인명함첩,,'),
    )
    expect(row?.email).toBe('skim@example.com')
    expect(row?.affiliation).toBe('포스코기술투자')
    expect(row?.phone).toBe('010-3153-9039')
  })

  it('대응 열이 없는 값은 버린다 — 원장에 자리가 없다', () => {
    const [row] = parseBulkCsv(remember('회사,홍길동,,,a@b.com,강남대로 1,02-1,02-2,010-1,2026년 01월 01일,개인명함첩,염재민,'))
    expect(row?.country).toBe('')
    expect(row?.expertise).toEqual([])
    expect(row?.linkedin).toBe('')
  })

  it('엑셀이 지수 표기로 바꾼 번호는 저장하지 않고 사실만 남긴다', () => {
    const [row] = parseBulkCsv(remember('TCELS,김성호,,,a@b.com,,,,8.41646E+11,2026년 01월 01일,개인명함첩,,'))
    expect(row?.phoneCorrupt).toBe(true)
    expect(row?.phone).toBe('')
  })
})

describe('foldFileDuplicates', () => {
  const rows = (...lines: string[]) => foldFileDuplicates(parseBulkCsv(remember(...lines)))

  it('이름과 연락처가 같으면 한 줄로 접고 접힌 줄 번호를 남긴다', () => {
    const out = rows(
      '신당,천하람,,의원,a@b.com,,,,010-1111-2222,2026년 01월 01일,개인명함첩,,',
      '개혁신당,천하람,전략실,대표,a@b.com,,,,010-1111-2222,2026년 02월 01일,개인명함첩,,',
    )
    expect(out).toHaveLength(1)
    // 값이 더 많이 찬 줄이 남는다.
    expect(out[0]?.affiliation).toBe('개혁신당')
    expect(out[0]?.foldedLines).toEqual([2])
  })

  it('진 줄의 값은 빈 칸만 메운다 — 남기기로 한 줄을 덮지 않는다', () => {
    const out = rows(
      '한국광기술원,김태언,연구본부,책임,a@b.com,,,,010-3333-4444,2026년 01월 01일,개인명함첩,,',
      ',김태언,,,a@b.com,,,,010-3333-4444,2026년 02월 01일,개인명함첩,,',
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.affiliation).toBe('한국광기술원')
    expect(out[0]?.position).toBe('책임')
  })

  it('회사 대표 메일을 같이 쓰는 동료는 접지 않는다 — 이름을 함께 보는 이유다', () => {
    const out = rows(
      '어느회사,홍길동,,,info@example.com,,,,010-1,2026년 01월 01일,개인명함첩,,',
      '어느회사,김철수,,,info@example.com,,,,010-2,2026년 01월 01일,개인명함첩,,',
    )
    expect(out).toHaveLength(2)
  })

  it('동명이인은 연락처가 다르면 접지 않는다', () => {
    const out = rows(
      '알이글로벌,김남국,,,a@b.com,,,,010-1111-1111,2026년 01월 01일,개인명함첩,,',
      'E.LAND,김남국,,,c@d.com,,,,010-2222-2222,2026년 01월 01일,개인명함첩,,',
    )
    expect(out).toHaveLength(2)
  })
})

describe('guessCountryName', () => {
  it('국가번호를 긴 것부터 본다', () => {
    expect(guessCountryName('+370 612 34567')).toBe('리투아니아')
    expect(guessCountryName('+66 81 234 5678')).toBe('태국')
    expect(guessCountryName('+81-3-1234-5678')).toBe('일본')
    expect(guessCountryName('0082-10-1234-5678')).toBe('한국')
  })

  it('국내 번호 꼴은 한국으로 본다', () => {
    expect(guessCountryName('010-9862-3534')).toBe('한국')
    expect(guessCountryName('02-3457-6412')).toBe('한국')
    expect(guessCountryName('070-7791-4632')).toBe('한국')
  })

  it('짐작할 근거가 없으면 비운다 — 잘못 짚은 국가는 미확인보다 나쁘다', () => {
    expect(guessCountryName('')).toBe('')
    // 앞에 0도 +도 없는 번호는 어느 나라 것인지 알 수 없다.
    expect(guessCountryName('4105436083')).toBe('')
    // 훼손된 번호에서 국가를 읽으면 잘려 나간 자릿수로 짚게 된다.
    expect(guessCountryName('8.41646E+11')).toBe('')
  })
})

describe('대량 업로드 국가 확정', () => {
  it('실제 업로드 대상의 국가 미확인 건을 센다', () => {
    expect(
      countRowsMissingCountry([
        { countryTagId: 'kr' },
        { countryTagId: null },
        { countryTagId: '' },
      ]),
    ).toBe(2)
  })

  it('국가가 확정된 값만 저장 페이로드로 통과시킨다', () => {
    expect(requireCountryTagId('kr')).toBe('kr')
    expect(() => requireCountryTagId(null)).toThrow('network_country_required')
  })
})
