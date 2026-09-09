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
 * **계정이 두 벌 생기지 않는 것은 화면이 아니라 발급이 보장한다.** `issue_guest_account`는
 * (원장 행 × 이메일)로 멱등이라 같은 대표자면 이미 있는 계정을 그대로 돌려준다. 그래서
 * '기존 계정 고르기' 셀렉트가 없어도 같은 사람이 비밀번호를 두 벌 받지 않는다 — 종전에 그
 * 셀렉트가 지키던 규칙을 서버가 이미 지키고 있었다.
 */

/** 계정 명의 한 벌. 이메일이 로그인 ID이고 연락처가 초기 비밀번호다. */
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

/**
 * 담당자가 그 자리에서 채워야 하는가 — **이름 또는 이메일이 비었을 때만** 그렇다.
 *
 * 연락처는 묻지 않는다. 초기 비밀번호가 되는 값이지만 이미 그 이메일의 계정이 있으면 서버가
 * 그 계정을 그대로 돌려주므로(멱등) 비밀번호를 새로 만들 일이 없고, 정말 필요한 경우에는
 * 서버가 사유와 함께 멈춘다.
 */
export function needsPerson(c: LedgerPerson): boolean {
  const p = ledgerPerson(c)
  return !p.name.trim() || !p.email.trim()
}

/** 실제로 쓸 명의 — 원장 값이 기본이고 담당자가 적은 값이 이긴다(서버의 판정과 같은 순서다). */
export function resolvePerson(c: LedgerPerson, typed: PersonInput | undefined): PersonInput {
  const base = ledgerPerson(c)
  if (!typed) return base
  return {
    name: typed.name.trim() || base.name,
    email: typed.email.trim() || base.email,
    phone: typed.phone.trim() || base.phone,
  }
}

/** 이 명의로 계정을 세울 수 있는가. 이메일이 로그인 ID라 이름과 함께 필수다. */
export function isPersonReady(p: PersonInput): boolean {
  return Boolean(p.name.trim() && p.email.trim())
}
