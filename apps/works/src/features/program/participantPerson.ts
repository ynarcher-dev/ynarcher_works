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

/** 계정을 열려면 원장이 답해야 하는 값. `name`은 로그인 명의(기업=대표자, 전문가=본인)다. */
export type PersonField = 'name' | 'email' | 'phone'

/**
 * 원장이 **비워 둔 칸**. 비어 있지 않으면 빈 배열이다.
 *
 * 셋을 함께 보는 이유는 셋 다 계정을 세우는 데 쓰이기 때문이다 — 명의는 그 계정이 누구인지,
 * 이메일은 로그인 ID, 연락처는 초기 비밀번호다. 종전 판정(`needsPerson`)은 연락처를 뺐는데,
 * 그 근거는 *발급이 멱등이라 비밀번호를 새로 만들 일이 없다*였다. 그 말은 **이미 계정이 있는**
 * 사람에게만 참이라, 처음 여는 대상에서는 연락처가 없으면 서버가 멈춘다. '명단에 담긴 것은
 * 계정을 열 수 있다'를 규칙으로 삼는 이상(2026-09-10) 셋이 같은 무게다.
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
 * 이 원장 행으로 계정을 열 수 있는가 — **명단에 담을 수 있는가와 같은 판정**이다.
 *
 * 두 물음을 하나로 묶은 것이 2026-09-10 사용자 결정이다. 종전에는 명단에 이름만 있으면 담기고
 * 모자란 값은 계정 생성 창에서 채웠는데, 그러면 **원장을 고치는 자리가 둘**이 되고 그중 하나가
 * 계정을 세우는 창이었다. 값의 집은 원장이므로, 담는 문 앞에서 한 번 묻고 그 뒤로는 묻지
 * 않는다 — 계정 생성 창은 원장을 쓰지 않는다.
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
