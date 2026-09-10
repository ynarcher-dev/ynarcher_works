import { describe, expect, it } from 'vitest'
import { isInternalPerson, isOrgLikeName, suggestCategory } from '@/features/networks/categoryRules'

/**
 * 규칙표는 눈으로 읽어서는 맞는지 알 수 없다 — 낱말이 서로를 가리기 때문이다. 여기 담은 것은
 * 실제 리멤버 명함첩 한 벌(2026-09-10, 1,444장)에서 **규칙끼리 부딪힌 자리**를 뽑은 것이고,
 * 그래서 이 시험은 표기 하나하나가 맞는지가 아니라 **순서가 지켜지는지**를 지킨다.
 */
describe('suggestCategory — 규칙 순서', () => {
  it('대학이 기관보다 먼저다 — KAIST의 "기술원"이 기관 낱말이다', () => {
    expect(suggestCategory('한국과학기술원')).toBe('universities')
    expect(suggestCategory('한국광기술원')).toBe('institutions')
  })

  it('전문 사무소가 투자사보다 먼저다 — 법인 상호에 "파트너스"가 흔하다', () => {
    expect(suggestCategory('법무법인(유한) 태평양')).toBe('experts')
    expect(suggestCategory('정동회계법인')).toBe('experts')
  })

  it('기관이 투자사보다 먼저다 — 공공기관 이름에 "벤처"가 들어간다', () => {
    expect(suggestCategory('중소벤처기업진흥공단')).toBe('institutions')
    expect(suggestCategory('벤처기업협회')).toBe('institutions')
    expect(suggestCategory('블루포인트파트너스')).toBe('investors')
  })

  it('영문 center는 기관 낱말이 아니다 — 기업 상호에 흔하다', () => {
    expect(suggestCategory('CJ ENM Center')).toBe('etc')
    expect(suggestCategory('창업지원센터')).toBe('institutions')
  })

  it('도메인이 소속을 대신 답한다', () => {
    expect(suggestCategory('', 'a@snu.ac.kr')).toBe('universities')
    expect(suggestCategory('', 'a@kibo.or.kr')).toBe('institutions')
    expect(suggestCategory('', 'a@metamonster.co.kr')).toBe('corporates')
  })

  it('지자체·중앙부처는 상호 끝에서 판정한다 — 도메인이 붙으면 끝 글자가 도메인이다', () => {
    expect(suggestCategory('경상북도', 'a@korea.kr')).toBe('institutions')
    expect(suggestCategory('과학기술정보통신부')).toBe('institutions')
  })
})

describe('suggestCategory — 기타와 미지정', () => {
  it('소속이 있으면 언제나 답한다 — 규칙에 없는 소속은 기타다', () => {
    expect(suggestCategory('이데일리')).toBe('etc')
    expect(suggestCategory('개혁신당')).toBe('etc')
  })

  it('짐작할 근거가 하나도 없을 때만 미지정이다', () => {
    expect(suggestCategory('')).toBeNull()
    expect(suggestCategory(null, null)).toBeNull()
  })

  it('자유 메일 도메인은 근거가 되지 못한다 — 소속이 비면 미지정이다', () => {
    expect(suggestCategory('', 'a@gmail.com')).toBeNull()
    expect(suggestCategory('', 'a@naver.com')).toBeNull()
  })

  it('영문 법인격은 낱말 경계로 본다 — inc가 다른 낱말 속에서 걸리면 안 된다', () => {
    expect(suggestCategory('Acme Inc.')).toBe('corporates')
    expect(suggestCategory('Province Design')).toBe('etc')
  })
})

describe('isInternalPerson', () => {
  it('도메인이 답한다 — 상호 표기가 명함마다 다르다', () => {
    for (const aff of ['Y&ARCHER', 'Y&ARCHER INVESTMENT', 'Y&ARCHER VENTURES', '와이앤아처(주)', '와이앤아처 주식회사']) {
      expect(isInternalPerson(aff, 'a@ynarcher.com')).toBe(true)
    }
  })

  it('개인 메일을 적은 자사 명함은 상호가 답한다', () => {
    expect(isInternalPerson('와이앤아처(주)', 'a@gmail.com')).toBe(true)
    expect(isInternalPerson('Y & ARCHER', null)).toBe(true)
  })

  it('바깥 사람은 걸리지 않는다', () => {
    expect(isInternalPerson('네이버', 'a@naver.com')).toBe(false)
    expect(isInternalPerson('', '')).toBe(false)
  })
})

describe('isOrgLikeName', () => {
  it('회사 명함이 사람으로 스캔된 줄을 잡는다', () => {
    expect(isOrgLikeName('THE FEDERATION OF THAI INDUSTRIES')).toBe(true)
    expect(isOrgLikeName('Carlton Hotel Bangkok Sukhumvit')).toBe(true)
    expect(isOrgLikeName('세종청사')).toBe(true)
  })

  it('긴 외국 사람 이름은 잡지 않는다 — 글자 수로 재지 않는 이유다', () => {
    expect(isOrgLikeName('Patrachart Komolkiti, Ph.D.')).toBe(false)
    expect(isOrgLikeName('이병일 Lee Byung il Daniel')).toBe(false)
    expect(isOrgLikeName('홍길동')).toBe(false)
  })
})
