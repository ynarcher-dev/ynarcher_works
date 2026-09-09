import { describe, expect, it } from 'vitest'
import {
  bestMatchFor,
  findDuplicateProbes,
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
  nName: name.trim().toLowerCase(),
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
