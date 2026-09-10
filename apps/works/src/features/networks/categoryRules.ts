import type { NetworkCategory } from '@/features/networks/config'

/**
 * 소속 한 줄에서 **구분**과 **자사 사람인지**를 읽는 규칙표.
 *
 * config.ts에서 떼어 낸 이유는 둘이다. 규칙이 낱말 목록이라 앞으로도 계속 자랄 자리이고,
 * 이 파일에는 실행되는 import가 하나도 없어(타입만 가져온다) 화면을 세우지 않고 그대로
 * 시험할 수 있다 — 규칙표는 눈으로 읽어 맞는지 알 수 없고 실제 파일에 걸어 봐야 안다.
 *
 * 판정 축은 **소속 하나**다(2026-09-10 사용자 결정: "소속을 기준으로 분류"). 사람이 무엇인지는
 * 어디에 속했는지가 답하므로, 소속도 회사 메일 도메인도 없는 명함에는 추천할 것이 없다.
 */

/**
 * 자사 메일 도메인. 이 주소로 온 명함은 네트워크 원장에 들어오지 않는다 —
 * 이 원장이 담는 것은 **회사 밖 사람**이고 임직원 원장은 MANAGEMENT가 따로 갖는다.
 */
export const INTERNAL_EMAIL_DOMAIN = 'ynarcher.com'

/**
 * 자사 상호 표기. 한 명함첩 안에서만도 `Y&ARCHER` · `Y&ARCHER INVESTMENT` ·
 * `Y&ARCHER VENTURES` · `와이앤아처(주)` · `와이앤아처 주식회사` 다섯 가지로 적혀 있어,
 * 상호를 글자 그대로 맞추면 반드시 샌다. 그래서 도메인과 **OR**로 묶는다 — 개인 메일을 적은
 * 임직원 명함은 도메인이 답하지 못하고, 남의 도메인을 쓴 자사 명함은 없다.
 */
const INTERNAL_AFFILIATION = /y\s*&\s*archer|ynarcher|와이앤아처/i

/** 이메일에서 도메인만. 없으면 빈 문자열. */
export function mailDomain(email: string | null | undefined): string {
  return (email ?? '').split('@')[1]?.trim().toLowerCase() ?? ''
}

/**
 * 자사 사람인가. 업로드에서 이 행은 **고를 수 없는 제외**다(2026-09-10 사용자 결정).
 * 추천이 아니라 정책이라 화면에서 되돌리지 못하게 두며, 그래서 판정도 넉넉히 잡지 않고
 * 자사임이 확실한 두 신호만 본다.
 */
export function isInternalPerson(
  affiliation: string | null | undefined,
  email: string | null | undefined,
): boolean {
  if (mailDomain(email) === INTERNAL_EMAIL_DOMAIN) return true
  return INTERNAL_AFFILIATION.test(affiliation ?? '')
}

/**
 * 자유 메일 도메인 — 소속을 짐작할 근거가 되지 못한다.
 *
 * 이 목록이 필요한 이유는 규칙이 아니라 **미지정 판정** 때문이다. 소속 칸이 빈 명함에
 * `gmail.com`이 붙어 있다고 구분을 추천하면 그 추천의 근거는 아무것도 없는데, 화면에서는
 * 다른 추천과 똑같이 확정된 값처럼 선다.
 */
const FREE_MAIL = new Set([
  'gmail.com', 'naver.com', 'daum.net', 'hanmail.net', 'nate.com', 'kakao.com',
  'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'yahoo.co.jp',
  'icloud.com', 'me.com', 'protonmail.com', 'qq.com', '163.com', 'empas.com', 'korea.com',
])

/** 지방자치단체 — 상호 **끝**에서만 판정한다(도메인이 붙은 문자열에서는 끝 글자가 도메인이다). */
const LOCAL_GOV = /(광역시|특별시|특별자치시|특별자치도|[가-힣]{2}(북도|남도)|경기도|강원도|제주도)$/

/** 중앙행정기관. 이름을 통째로 적는다 — `~부`로 끊으면 '연구개발본부' 같은 부서명이 함께 걸린다. */
const MINISTRY =
  /(기획재정부|교육부|과학기술정보통신부|외교부|통일부|법무부|국방부|행정안전부|국가보훈부|문화체육관광부|농림축산식품부|산업통상자원부|보건복지부|환경부|고용노동부|여성가족부|국토교통부|해양수산부|중소벤처기업부)$/

/** 공공 도메인(`go.kr` · `or.kr` · `go.th` …)과 정부 대표 도메인. */
const PUBLIC_DOMAIN = /\.(go|or)\.[a-z]{2}\b|\bkorea\.kr\b|\.gov\b/
/** 대학 도메인(`ac.kr` · `ac.th` · `ac.uk` …). */
const ACADEMIC_DOMAIN = /\.ac\.[a-z]{2}\b|\.edu\b/
/** 기업 도메인(`co.kr` · `co.jp` · `co.th` …). */
const COMPANY_DOMAIN = /\.co\.[a-z]{2}\b/
/** 영문 법인격 표기. 낱말 경계를 두지 않으면 `inc`가 `since`·`province` 안에서 걸린다. */
const LEGAL_FORM = /\b(inc|corp|corporation|ltd|limited|llc|plc|gmbh|pte|pty)\b/

/**
 * 소속(과 회사 메일 도메인)으로 추천 구분을 추정한다.
 *
 * **소속이 있으면 언제나 답한다** — 규칙에 걸리지 않는 소속은 `etc`(기타)다. 2026-09-10
 * 사용자 결정 "긴가민가한 종류는 전부 기타". 종전에는 여기서 `null`을 돌려주고 업로드
 * 화면이 그 빈 칸을 막았는데, 명함첩 한 벌을 올리면 절반이 빈 칸이라 **통과할 수 없는
 * 문**이었다. 사람이 파일을 다시 들여다봐도 '이데일리'가 8종 중 무엇인지 답이 없다면,
 * 그 자리에서 정할 수 있는 유일한 답이 기타다.
 *
 * `null`은 **소속을 짐작할 근거가 하나도 없을 때**만이며 화면에서 '미지정'으로 선다.
 *
 * 순서가 규칙의 절반이다 — 아래로 갈수록 낱말이 흔해지므로, 위에서 걸리는 것이 정답이다.
 */
export function suggestCategory(
  affiliation: string | null | undefined,
  email?: string | null,
): NetworkCategory | null {
  const aff = (affiliation ?? '').trim()
  const domain = mailDomain(email)
  const hay = `${aff} ${FREE_MAIL.has(domain) ? '' : domain}`.toLowerCase().trim()
  if (!hay) return null
  const has = (...words: string[]) => words.some((w) => hay.includes(w))

  // ① 대학·연구. 기관보다 먼저다 — '한국과학기술원'(KAIST)은 대학인데 '기술원'이 ③에 있다.
  if (has('대학', 'univ', 'college', '과학기술원', '연구소', '연구원', 'school')) return 'universities'
  if (ACADEMIC_DOMAIN.test(hay)) return 'universities'

  // ② 전문 사무소. 투자사보다 먼저다 — 법무·특허법인 상호에 '파트너스'가 흔하다.
  if (
    has('법무법인', '법률사무', '특허법인', '특허사무소', '변리사', '회계법인', '세무법인',
      '세무회계', '노무법인', '관세법인', '행정사법인', '감정평가', 'law firm')
  ) {
    return 'experts'
  }

  // ③ 공공·기관. 투자사보다 먼저다 — '중소벤처기업진흥공단'에는 '벤처'가 들어 있다.
  //    영문 'center'는 넣지 않는다(한글 '센터'만) — 'CJ ENM Center' 같은 기업 상호가 함께 걸린다.
  if (
    has('진흥원', '진흥공단', '진흥', '재단', '협회', '공사', '공단', '기금', '금융원',
      '상공회의소', '회의소', '기술원', '국회', '국무', '위원회', '교육청', '도청', '시청',
      '군청', '구청', '보건소', '대사관', '영사관', '공제회', '연맹', '학회', '약사회', '의사회', '연합회', '센터',
      'foundation', 'agency', 'institute', 'ministry', 'government', 'council', 'embassy')
  ) {
    return 'institutions'
  }
  if (PUBLIC_DOMAIN.test(hay)) return 'institutions'
  if (LOCAL_GOV.test(aff) || MINISTRY.test(aff)) return 'institutions'

  // ④ 투자사.
  if (
    has('벤처', '인베스트', '캐피탈', '캐피털', '자산운용', '파트너스', '기술지주', '창업투자',
      '신기술금융', '액셀러레이터', '엑셀러레이터', '증권', 'ventures', 'venture', 'capital',
      'partners', 'invest', 'accelerator', 'securities', 'angels')
  ) {
    return 'investors'
  }

  // ⑤ 기업. 가장 흔한 낱말이라 맨 아래에 둔다.
  if (
    has('㈜', '주식회사', '(주)', '유한회사', '유한책임회사', '홀딩스', 'holdings', '그룹',
      '은행', '보험', '카드', '전자', '건설', '제약', '바이오', '텔레콤', '호텔', 'hotel',
      'bank', 'company', '컴퍼니', '코퍼레이션', '리테일', '엔터테인먼트', 'entertainment',
      '커머스', 'commerce', '모빌리티', '물류', '식품', '화학', '반도체', '에너지', '코리아')
  ) {
    return 'corporates'
  }
  if (COMPANY_DOMAIN.test(hay) || LEGAL_FORM.test(hay)) return 'corporates'

  return 'etc'
}

/**
 * 이름 칸에 조직명이 들어온 행인가.
 *
 * 명함첩에는 회사 명함(사람 이름이 없는 안내용 카드)이 사람으로 스캔돼 섞여 들어온다.
 * 판정은 **낱말로만** 한다 — 글자 수로 재면 `Patrachart Komolkiti, Ph.D.` 같은 외국 사람
 * 이름이 통째로 걸린다(실제 파일에서 그 방식은 오탐이 열 배였다).
 *
 * 이 표시는 막지 않고 기본값만 건너뛰기로 둔다 — 규칙이 아니라 의심이라, 되돌릴 자리를 남긴다.
 */
const ORG_LIKE_NAME =
  /(hotel|federation|university|institute|agency|hospital|school|ministry|organization|공사|공단|주식회사|㈜|\(주\)|co\.,\s?ltd|corp\.|inc\.|청사|센터)/i

export function isOrgLikeName(name: string | null | undefined): boolean {
  return ORG_LIKE_NAME.test(name ?? '')
}
