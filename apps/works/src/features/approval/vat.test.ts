import { describe, expect, it } from 'vitest'
import {
  deriveAmounts,
  parseVatKind,
  readAmounts,
  splitFromGross,
  splitFromNet,
  sumAmounts,
  validateAmounts,
  vatRate,
  withVat,
} from './vat'

describe('과세 유형', () => {
  it('대소문자를 가리지 않고 읽는다', () => {
    expect(parseVatKind('taxable')).toBe('TAXABLE')
    expect(parseVatKind(' ZERO_RATED ')).toBe('ZERO_RATED')
  })

  it('빈 값과 모르는 값은 과세로 되돌리지 않는다', () => {
    expect(parseVatKind('')).toBeNull()
    expect(parseVatKind(undefined)).toBeNull()
    expect(parseVatKind('VAT10')).toBeNull()
  })

  it('세율이 0인 유형 셋은 서로 다른 값으로 남는다', () => {
    expect(vatRate('TAXABLE')).toBe(0.1)
    expect(vatRate('EXEMPT')).toBe(0)
    expect(vatRate('ZERO_RATED')).toBe(0)
    expect(vatRate('NOT_TAXABLE')).toBe(0)
    expect(vatRate(null)).toBeNull()
  })
})

describe('합계액에서 되짚기', () => {
  it('부가세 포함 총액을 공급가액과 세액으로 가른다', () => {
    expect(splitFromGross(1_100_000, 'TAXABLE')).toEqual({
      net: 1_000_000,
      vat: 100_000,
      gross: 1_100_000,
    })
  })

  it('나누어떨어지지 않아도 합계액은 담당자가 적은 값 그대로다', () => {
    const split = splitFromGross(10_000, 'TAXABLE')
    expect(split).toEqual({ net: 9_091, vat: 909, gross: 10_000 })
    expect(split.net! + split.vat!).toBe(10_000)
  })

  it('세율이 0인 유형은 공급가액이 곧 합계액이다', () => {
    expect(splitFromGross(50_000, 'EXEMPT')).toEqual({ net: 50_000, vat: 0, gross: 50_000 })
    expect(splitFromGross(50_000, 'NOT_TAXABLE')).toEqual({ net: 50_000, vat: 0, gross: 50_000 })
  })

  it('과세 유형을 모르면 쪼개지 않고 합계액만 남긴다', () => {
    expect(splitFromGross(50_000, null)).toEqual({ net: null, vat: null, gross: 50_000 })
  })
})

describe('공급가액에서 쌓기', () => {
  it('공급가액 × 세율을 더해 합계액을 만든다', () => {
    expect(splitFromNet(1_000_000, 'TAXABLE')).toEqual({
      net: 1_000_000,
      vat: 100_000,
      gross: 1_100_000,
    })
  })

  it('되짚기와 왕복해도 같은 합계액으로 돌아온다', () => {
    const back = splitFromGross(10_000, 'TAXABLE')
    expect(splitFromNet(back.net!, 'TAXABLE').gross).toBe(10_000)
  })

  it('증빙대로 세액을 고치면 합계액만 따라간다', () => {
    expect(withVat(9_091, 900)).toEqual({ net: 9_091, vat: 900, gross: 9_991 })
  })
})

describe('한 칸을 고쳤을 때', () => {
  it('과세 유형을 바꿔도 합계액은 흔들리지 않는다', () => {
    const next = deriveAmounts({ net: 9_091, vat: 909, gross: 10_000 }, 'EXEMPT', 'KIND')
    expect(next).toEqual({ net: 10_000, vat: 0, gross: 10_000 })
  })

  it('세액을 직접 고치면 산식이 덮어쓰지 않는다', () => {
    const next = deriveAmounts({ net: 9_091, vat: 900, gross: 10_000 }, 'TAXABLE', 'VAT')
    expect(next).toEqual({ net: 9_091, vat: 900, gross: 9_991 })
  })

  it('공급가액을 고치면 세액과 합계액이 따라간다', () => {
    const next = deriveAmounts({ net: 2_000_000, vat: 909, gross: 10_000 }, 'TAXABLE', 'NET')
    expect(next).toEqual({ net: 2_000_000, vat: 200_000, gross: 2_200_000 })
  })
})

describe('읽기와 합계', () => {
  it('쉼표가 섞인 문자열을 읽고 없는 칸은 null로 둔다', () => {
    expect(
      readAmounts(
        { net: '1,000,000', vat: '100,000', gross: '1,100,000', kind: 'TAXABLE' },
        { grossKey: 'gross', netKey: 'net', vatKey: 'vat', kindKey: 'kind' },
      ),
    ).toEqual({ net: 1_000_000, vat: 100_000, gross: 1_100_000, kind: 'TAXABLE', bad: false })
  })

  it('부가세 칸이 없는 옛 양식은 합계액만 읽힌다', () => {
    expect(readAmounts({ amount: '500' }, { grossKey: 'amount' })).toEqual({
      net: null,
      vat: null,
      gross: 500,
      kind: null,
      bad: false,
    })
  })

  it('숫자로 읽을 수 없는 칸은 빈 칸과 구분해 표시한다', () => {
    const keys = { grossKey: 'gross', netKey: 'net', vatKey: 'vat' }
    expect(readAmounts({ gross: '1oo원', net: '', vat: '' }, keys).bad).toBe(true)
    expect(readAmounts({ gross: 'Infinity' }, keys).bad).toBe(true)
    // 진짜 빈 행과 공백만 적힌 행은 오타가 아니다.
    expect(readAmounts({}, keys).bad).toBe(false)
    expect(readAmounts({ gross: '  ' }, keys).bad).toBe(false)
  })

  it('미입력은 0원으로 세지 않는다', () => {
    expect(
      sumAmounts([
        { net: 100, vat: 10, gross: 110 },
        { net: null, vat: null, gross: null },
      ]),
    ).toEqual({ net: 100, vat: 10, gross: 110 })
    expect(sumAmounts([{ net: null, vat: null, gross: null }])).toEqual({
      net: null,
      vat: null,
      gross: null,
    })
  })
})

describe('금액 정합성', () => {
  it('아무것도 적지 않은 줄은 통과한다', () => {
    expect(validateAmounts({ net: null, vat: null, gross: null }, null)).toBeNull()
  })

  it('부가세 칸이 없는 옛 양식은 합계액만 본다', () => {
    expect(validateAmounts({ net: null, vat: null, gross: 500 }, null, false)).toBeNull()
    expect(validateAmounts({ net: null, vat: null, gross: -1 }, null, false)).toMatch('0원 이상')
  })

  it('부가세를 쓰는 양식에서 세 칸을 비우면 옛 양식으로 넘어가지 않는다', () => {
    expect(validateAmounts({ net: null, vat: null, gross: 500 }, null, true)).toMatch('모두 입력')
  })

  it('합계액이 공급가액+부가세와 다르면 막는다', () => {
    expect(validateAmounts({ net: 1_000, vat: 100, gross: 1_200 }, 'TAXABLE')).toMatch('합계액')
  })

  it('세율이 0인 유형에 세액이 붙으면 막는다', () => {
    expect(validateAmounts({ net: 1_000, vat: 100, gross: 1_100 }, 'EXEMPT')).toMatch('세액')
  })

  it('음수 금액을 막는다', () => {
    expect(validateAmounts({ net: -1_000, vat: 0, gross: -1_000 }, 'EXEMPT')).toMatch('0원 이상')
  })

  it('해석 불가한 금액은 빈 행으로 통과하지 않는다', () => {
    expect(
      validateAmounts({ net: null, vat: null, gross: null, bad: true }, null, false),
    ).toMatch('숫자로 읽을 수 없는')
    // 옛 문서의 합계액 한 칸(쉼표 표기)은 그대로 통과해야 한다.
    expect(
      validateAmounts(
        readAmounts({ amount: '1,100,000' }, { grossKey: 'amount' }),
        null,
        false,
      ),
    ).toBeNull()
  })

  it('증빙대로 고친 세액은 합계만 맞으면 통과한다', () => {
    expect(validateAmounts({ net: 9_091, vat: 900, gross: 9_991 }, 'TAXABLE')).toBeNull()
  })
})
