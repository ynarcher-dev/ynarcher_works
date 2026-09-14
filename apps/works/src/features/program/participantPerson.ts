/**
 * 명부 한 줄이 **누구로** 들어오는가 — 그 답은 원장이 갖는다.
 *
 * 사람을 고르는 축을 두지 않는다(2026-09-09 사용자 확정: "기업 DB는 대표자가 기준이고, 기업
 * 하위에 사람을 복수로 지정할 일이 없다"). 계정의 단위는 사람이지만(3_9_2 §5) **원장의 단위는
 * 회사이고, 그 회사를 대표해 들어오는 사람은 대표자 하나**다. 고를 것이 하나뿐인 목록은
 * "고를 수 있다"고 말하는 컨트롤이라, 담당자에게 있지도 않은 선택지를 매번 보여 준다.
 *
 * DB도 이미 그 모델이었다 — `uq_program_participants_master`가 한 사업에 같은 원장 행을 한
 * 줄로 묶으므로, 고르게 두어도 한 사업에 설 수 있는 사람은 어차피 하나다.
 *
 * 이 파일은 업무 명부의 표시·입력만 다룹니다. GUEST 계정은 별도 통합 화면에서 독립적으로
 * 만들고, 사업 접근은 기존 계정을 참여 줄에 배정하므로 여기의 원장 행과 관계형 매칭하지 않습니다.
 */

/**
 * 업무 원장이 보유하는 연락 명의 한 벌.
 *
 * **연락처는 자격증명이 아니다**(2026-09-14 — 초기 비밀번호가 고정값으로 옮겨졌다, 3_9_1 §6).
 * 아래 `ledgerGaps`가 연락처를 계속 필수로 세우는 것은 그 값이 **원장의 연락 수단**이기
 * 때문이고, 계정을 세우는 데 필요해서가 아니다.
 */
export interface PersonInput {
  name: string
  email: string
  phone: string
}

/**
 * 원장이 아는 명의. `MasterCandidate`가 이 모양을 그대로 갖는다 — 타입을 구조로 받는 것은
 * 이 파일이 데이터 계층을 되부르지 않기 위해서다(참조가 순환하면 어느 쪽이 정의인지 흐려진다).
 */
export interface LedgerPerson {
  /** 로그인 명의 — 기업은 대표자, 전문가는 본인, M&A는 담당자. */
  loginName: string | null
  email: string | null
  phone: string | null
}

/** 원장 값을 그대로 옮긴 명의. */
export function ledgerPerson(c: LedgerPerson): PersonInput {
  return { name: c.loginName ?? '', email: c.email ?? '', phone: c.phone ?? '' }
}

/** 업무 명부가 요구하는 값. `name`은 연락 명의(기업=대표자, 전문가=본인)다. */
export type PersonField = 'name' | 'email' | 'phone'

/**
 * 원장이 **비워 둔 칸**. 비어 있지 않으면 빈 배열이다.
 *
 * 셋을 함께 보는 이유는 이 창이 **원장의 빈 칸을 채우는 자리**이기 때문이다 — 명의는 그
 * 대상이 누구인지, 이메일은 연락과 로그인 ID의 근거, 연락처는 원장의 연락 수단이다.
 *
 * **2026-09-14 이후 셋의 근거가 같지 않다.** 그날 초기 비밀번호가 고정값이 되면서 연락처는
 * GUEST 계정을 세우는 데 더 이상 필요하지 않게 되었고, 계정을 세우는 자리도 이 창이 아니라
 * 통합 GUEST 계정 관리 하나다.
 * 그래도 연락처를 계속 요구하는 것은 **원장이 그 값을 필요로 하기 때문**이며, 이 판정은
 * 사업 원장 명단의 규칙이지 계정 발급의 규칙이 아니다. 바꾸려면 그 명단의 결정이 먼저다.
 */
export function ledgerGaps(c: LedgerPerson): PersonField[] {
  const p = ledgerPerson(c)
  const gaps: PersonField[] = []
  if (!p.name.trim()) gaps.push('name')
  if (!p.email.trim()) gaps.push('email')
  if (!p.phone.trim()) gaps.push('phone')
  return gaps
}

/**
 * 이 원장 행을 업무 명부에 담을 준비가 되었는가.
 *
 * 두 물음을 하나로 묶은 것이 2026-09-10 사용자 결정이다. 종전에는 명단에 이름만 있으면 담기고
 * 모자란 값은 계정 생성 창에서 채웠는데, 그러면 **원장을 고치는 자리가 둘**이 되고 그중 하나가
 * 계정 입력을 돕는 창이었다. 값의 집은 원장이므로 담는 문 앞에서 한 번 묻고 그 뒤로는 묻지
 * 않는다 — GUEST 계정 생성 창은 원장을 쓰지 않는다.
 *
 * 다만 **묻는 방식은 차단이 아니라 입력**이다(같은 날 후속). 담기 창은 빈 칸을 그 자리에서
 * 받아 원장에 반영하고 담으므로, 이 판정이 담기를 막는 자리는 없다. 남은 쓰임은 둘 —
 * 게이트가 서기 전에 담긴 옛 줄의 업무 연락처 누락을 알리는 것, 그리고 명단이 업무 원장인
 * 자리(FUND 포트폴리오)처럼 **담기 창 자체가 없는** 곳의 완결성을 확인하는 것이다.
 */
export function isLedgerReady(c: LedgerPerson): boolean {
  return ledgerGaps(c).length === 0
}

/**
 * 빈 칸을 담당자가 읽는 말로 — `대표자·연락처 없음`.
 *
 * 명의를 부르는 말은 자격마다 다르므로(대표자/담당자/성명) 밖에서 받는다. 이 파일이
 * 자격 표를 되부르지 않는 이유는 `LedgerPerson` 주석과 같다.
 */
export function gapText(gaps: PersonField[], loginNameLabel: string): string {
  if (gaps.length === 0) return ''
  const label: Record<PersonField, string> = {
    name: loginNameLabel,
    email: '이메일',
    phone: '연락처',
  }
  return `${gaps.map((g) => label[g]).join('·')} 없음`
}

/**
 * 원장의 **빈 칸에만** 얹는 값 한 벌 — 명단 담기 창에서 채운 것이다(2026-09-10).
 *
 * '고침'이 아니라 '메움'인 것이 이 타입의 전부다. 원장이 이미 답한 칸은 담기지 않으므로,
 * 이 값을 쓰는 경로가 원장의 값을 덮어쓸 수 없다 — 값의 집은 원장이고 고치는 자리도 원장
 * 하나다. 담는 문 앞에서 묻는 것은 *비어 있는 칸을 지금 채울 것인가* 뿐이다.
 */
export interface LedgerFill {
  masterId: string
  /** 채운 칸만 담는다. 비어 있으면 그 줄은 아직 담을 수 없다. */
  values: Partial<Record<PersonField, string>>
}
