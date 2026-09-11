import { describe, expect, it } from 'vitest'
import {
  bestMatchFor,
  findDuplicateProbes,
  normEntityName,
  type LedgerCandidate,
} from '@/features/master/ledgerMatch'

/**
 * 중복 대조 판정. **조회가 아니라 규칙만** 본다 — 어떤 행을 긁어 왔는가는 원장과 권한의
 * 문제이고, 여기서 지킬 것은 "무엇을 같은 대상으로 보는가" 하나다.
 */

const candidate = (
  id: string,
  name: string,
  email: string | null,
  phone: string | null,
  retired = false,
): LedgerCandidate => ({
  id,
  name,
  email,
  phone,
  retired,
  raw: { id, name, email, phone },
  nName: normEntityName(name),
  nEmail: (email ?? '').trim().toLowerCase(),
  nPhone: (phone ?? '').replace(/\D/g, ''),
})

describe('bestMatchFor', () => {
  it('두 칸이 일치하면 같은 대상으로 본다', () => {
    const found = bestMatchFor(
      { name: '와이앤아처', email: 'a@x.com', phone: '' },
      [candidate('c1', '와이앤아처', 'a@x.com', '01011112222')],
    )
    expect(found?.id).toBe('c1')
    expect(found?.hits).toBe(2)
  })

  it('한 칸만 같으면 걸리지 않는다 — 공용 대표번호·공용 메일의 오탐을 막는다', () => {
    expect(
      bestMatchFor({ name: '다른회사', email: 'info@x.com', phone: '' }, [
        candidate('c1', '와이앤아처', 'info@x.com', null),
      ]),
    ).toBeNull()
  })

  it('빈 칸끼리는 일치로 세지 않는다', () => {
    // 이름만 같고 이메일·전화가 양쪽 다 비었다 — 한 칸 일치라 걸리면 안 된다.
    expect(
      bestMatchFor({ name: '김철수', email: '', phone: '' }, [
        candidate('c1', '김철수', null, null),
      ]),
    ).toBeNull()
  })

  it('전화는 표기가 달라도 숫자가 같으면 일치다', () => {
    const found = bestMatchFor({ name: '와이앤아처', email: '', phone: '010-1111-2222' }, [
      candidate('c1', '와이앤아처', null, '01011112222'),
    ])
    expect(found?.hits).toBe(2)
  })

  it('이름은 대소문자·앞뒤 공백을 무시한다', () => {
    const found = bestMatchFor({ name: '  Acme  ', email: 'A@X.COM', phone: '' }, [
      candidate('c1', 'acme', 'a@x.com', null),
    ])
    expect(found?.id).toBe('c1')
  })

  it('일치 수가 많은 후보를 고른다', () => {
    const found = bestMatchFor({ name: '와이앤아처', email: 'a@x.com', phone: '01011112222' }, [
      candidate('c1', '와이앤아처', 'a@x.com', null),
      candidate('c2', '와이앤아처', 'a@x.com', '010-1111-2222'),
    ])
    expect(found?.id).toBe('c2')
    expect(found?.hits).toBe(3)
  })

  it('동률이면 살아 있는 행을 앞세운다', () => {
    const found = bestMatchFor({ name: '와이앤아처', email: 'a@x.com', phone: '' }, [
      candidate('dead', '와이앤아처', 'a@x.com', null, true),
      candidate('live', '와이앤아처', 'a@x.com', null, false),
    ])
    expect(found?.id).toBe('live')
  })

  it('살아 있는 후보가 없으면 내려간 행이라도 답한다 — 있는데 없다고 하지 않는다', () => {
    const found = bestMatchFor({ name: '와이앤아처', email: 'a@x.com', phone: '' }, [
      candidate('dead', '와이앤아처', 'a@x.com', null, true),
    ])
    expect(found?.id).toBe('dead')
    expect(found?.retired).toBe(true)
  })

  it('후보가 없으면 null이다', () => {
    expect(bestMatchFor({ name: '와이앤아처', email: 'a@x.com', phone: '' }, [])).toBeNull()
  })
})

/**
 * 파일 안 중복 — **빈 원장에 넣을 때는 이것이 유일한 방어선**이다(원장 대조는 전 줄을
 * 통과시킨다). 초기 데이터 이관이 정확히 그 상황이다.
 */
describe('findDuplicateProbes', () => {
  const probe = (name: string, email = '', phone = '') => ({ name, email, phone })

  it('같은 대상이 두 줄이면 뒤엣줄이 앞엣줄을 가리킨다', () => {
    const found = findDuplicateProbes([
      probe('딜챗', 'a@x.com'),
      probe('뉴런랩스', 'b@x.com'),
      probe('딜챗', 'a@x.com'),
    ])
    expect([...found]).toEqual([[2, 0]])
  })

  it('세 줄이 같으면 둘이 접히고 둘 다 첫 줄을 가리킨다', () => {
    const found = findDuplicateProbes([
      probe('딜챗', 'a@x.com'),
      probe('딜챗', 'a@x.com'),
      probe('딜챗', 'a@x.com'),
    ])
    expect([...found]).toEqual([
      [1, 0],
      [2, 0],
    ])
  })

  it('한 칸만 같으면 접지 않는다 — 원장 대조와 같은 기준이다', () => {
    expect(
      findDuplicateProbes([probe('딜챗', 'a@x.com'), probe('딜챗', 'b@x.com')]).size,
    ).toBe(0)
  })

  it('표기가 달라도 값이 같으면 접는다(대소문자·공백·전화 하이픈)', () => {
    const found = findDuplicateProbes([
      probe('Acme', 'A@X.COM', '010-1111-2222'),
      probe(' acme ', 'a@x.com', '01011112222'),
    ])
    expect(found.get(1)).toBe(0)
  })

  it('연락처가 양쪽 다 빈 동명이인은 접지 않는다 — 빈 칸은 일치가 아니다', () => {
    expect(findDuplicateProbes([probe('김철수'), probe('김철수')]).size).toBe(0)
  })

  it('한 줄짜리·빈 목록은 접을 것이 없다', () => {
    expect(findDuplicateProbes([probe('딜챗', 'a@x.com')]).size).toBe(0)
    expect(findDuplicateProbes([]).size).toBe(0)
  })
})

/**
 * 확실한 키(사업자등록번호, 2026-09-11) — 한 칸만 같아도 같은 대상이고, 표기(하이픈)가 달라도
 * 숫자가 같으면 같다. 무엇을 막을지는 정책(identityPolicy)이 답하고 여기서는 "걸리는가"만 본다.
 */
describe('hardKey', () => {
  const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
  const withHard = (c: LedgerCandidate, hard: string): LedgerCandidate => ({
    ...c,
    raw: { ...c.raw, biz_reg_no: hard },
    nHard: digits(hard),
  })

  it('사업자등록번호가 같으면 이름·연락처가 달라도 걸린다', () => {
    const found = bestMatchFor(
      { name: '전혀 다른 이름', email: '', phone: '', hard: '7428702461' },
      [withHard(candidate('c1', '주식회사 트루골프', null, null), '742-87-02461')],
      digits,
    )
    expect(found?.id).toBe('c1')
    expect(found?.hitFields).toEqual(['hard'])
  })

  it('정규화 함수를 주지 않으면 그 축은 없다 — 원장에 키가 없는 경우', () => {
    expect(
      bestMatchFor({ name: '다른', email: '', phone: '', hard: '7428702461' }, [
        withHard(candidate('c1', '트루골프', null, null), '742-87-02461'),
      ]),
    ).toBeNull()
  })

  it('확실한 키가 같은 후보를 두 칸 일치보다 앞세운다', () => {
    const found = bestMatchFor(
      { name: '트루골프', email: 'a@x.com', phone: '', hard: '7428702461' },
      [
        candidate('soft', '트루골프', 'a@x.com', null),
        withHard(candidate('hard', '옛 상호', null, null), '742-87-02461'),
      ],
      digits,
    )
    expect(found?.id).toBe('hard')
  })

  it('파일 안에서도 같은 번호 두 줄은 접힌다', () => {
    const found = findDuplicateProbes(
      [
        { name: '알투씨컴퍼니', email: '', phone: '', hard: '479-88-02430' },
        { name: '알투씨컴퍼니2', email: '', phone: '', hard: '4798802430' },
      ],
      digits,
    )
    expect(found.get(1)).toBe(0)
  })
})

describe('normEntityName', () => {
  it('법인 형태 표기와 공백을 걷는다 — 딜챗과 주식회사 딜챗이 같은 이름이다', () => {
    expect(normEntityName('주식회사 딜챗')).toBe('딜챗')
    expect(normEntityName('(주)딜챗')).toBe('딜챗')
    expect(normEntityName('㈜ 딜챗 ')).toBe('딜챗')
    expect(normEntityName('Deal Chat')).toBe('dealchat')
  })

  it('두 칸 판정에도 그대로 쓰인다', () => {
    const found = bestMatchFor({ name: '(주)트루골프', email: 'a@x.com', phone: '' }, [
      candidate('c1', '주식회사 트루골프', 'a@x.com', null),
    ])
    expect(found?.hitFields).toEqual(['name', 'email'])
  })
})
