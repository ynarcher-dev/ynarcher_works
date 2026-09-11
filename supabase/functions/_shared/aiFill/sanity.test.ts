import { describe, expect, it } from 'vitest'

import { checkIdentity, checkMagnitude, checkOrder, checkYearSeries } from './sanity.ts'

/**
 * 여기서 지키는 것은 **울려야 할 때 울리는가**와 **울리지 말아야 할 때 조용한가** 둘이다.
 *
 * 뒤쪽이 더 중요하다 — 한 번이라도 틀린 경고는 나머지 경고까지 함께 무디게 만들고, 그때부터
 * 이 판정 전부가 없는 것과 같아진다.
 */

const collect = () => {
  const lines: string[] = []
  return { lines, warn: (_card: 'x', line: string) => lines.push(line) }
}

describe('checkYearSeries', () => {
  it('중간 해가 빠지면 그 해를 말한다', () => {
    const { lines, warn } = collect()
    checkYearSeries([{ year: 2022 }, { year: 2024 }], 'year', warn, 'x', '매출 표')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('2023')
  })

  it('같은 해가 두 줄이면 말한다', () => {
    const { lines, warn } = collect()
    checkYearSeries([{ year: 2024 }, { year: 2024 }], 'year', warn, 'x', '매출 표')
    expect(lines[0]).toContain('같은 해가 두 번')
  })

  it('이어진 해에는 조용하다', () => {
    const { lines, warn } = collect()
    checkYearSeries([{ year: 2022 }, { year: 2023 }, { year: 2024 }], 'year', warn, 'x', '매출 표')
    expect(lines).toEqual([])
  })

  it('한 줄짜리 표는 보지 않는다(앞뒤가 없는 것은 흠이 아니다)', () => {
    const { lines, warn } = collect()
    checkYearSeries([{ year: 2024 }], 'year', warn, 'x', '매출 표')
    expect(lines).toEqual([])
  })

  it('오래된 한 해만 따로 실린 표는 연속을 전제하지 않는다', () => {
    const { lines, warn } = collect()
    checkYearSeries([{ year: 2005 }, { year: 2024 }], 'year', warn, 'x', '매출 표')
    expect(lines).toEqual([])
  })
})

describe('checkMagnitude', () => {
  const f = [{ key: 'revenue', label: '매출' }]

  it('천 배 넘게 뛰면 단위를 의심한다', () => {
    const { lines, warn } = collect()
    checkMagnitude([{ year: 2023, revenue: 1_200 }, { year: 2024, revenue: 1_400_000_000 }], 'year', f, warn, 'x')
    expect(lines[0]).toContain('단위')
  })

  it('초기 기업의 백 배 성장에는 울리지 않는다 — 사실보다 자주 울리는 경고는 곧 무시된다', () => {
    const { lines, warn } = collect()
    checkMagnitude([{ year: 2023, revenue: 10_000_000 }, { year: 2024, revenue: 1_000_000_000 }], 'year', f, warn, 'x')
    expect(lines).toEqual([])
  })

  it('0에서 시작한 해는 단위 문제가 아니다', () => {
    const { lines, warn } = collect()
    checkMagnitude([{ year: 2023, revenue: 0 }, { year: 2024, revenue: 5_000_000_000 }], 'year', f, warn, 'x')
    expect(lines).toEqual([])
  })

  it('단위가 통째로 섞여도 한 번만 말한다(경고가 표를 덮지 않는다)', () => {
    const { lines, warn } = collect()
    checkMagnitude(
      [
        { year: 2022, revenue: 1_000_000_000 },
        { year: 2023, revenue: 1_200 },
        { year: 2024, revenue: 1_400_000_000 },
      ],
      'year',
      f,
      warn,
      'x',
    )
    expect(lines).toHaveLength(1)
  })
})

describe('checkIdentity', () => {
  it('자산이 부채+자본과 어긋나면 해를 말한다', () => {
    const { lines, warn } = collect()
    checkIdentity(
      [{ year: 2024, assets: 100, liabilities: 40, equity: 50 }],
      'year',
      'assets',
      ['liabilities', 'equity'],
      1,
      warn,
      'x',
      '자산 ≠ 부채+자본',
    )
    expect(lines[0]).toContain('2024')
  })

  it('여유 안의 잔차는 오류가 아니다', () => {
    const { lines, warn } = collect()
    checkIdentity([{ year: 2024, assets: 100, liabilities: 40, equity: 60.5 }], 'year', 'assets', ['liabilities', 'equity'], 1, warn, 'x', 'm')
    expect(lines).toEqual([])
  })

  it('칸이 비어 있으면 판정하지 않는다(빈 칸을 0으로 세지 않는다)', () => {
    const { lines, warn } = collect()
    checkIdentity([{ year: 2024, assets: 100, liabilities: null, equity: 60 }], 'year', 'assets', ['liabilities', 'equity'], 1, warn, 'x', 'm')
    expect(lines).toEqual([])
  })
})

describe('checkOrder', () => {
  const pairs = [{ larger: 'revenue', smaller: 'operatingProfit', message: '영업이익이 매출보다 큽니다' }]

  it('정의상 불가능한 관계를 말한다', () => {
    const { lines, warn } = collect()
    checkOrder([{ year: 2024, revenue: 100, operatingProfit: 150 }], 'year', pairs, warn, 'x')
    expect(lines[0]).toContain('영업이익')
  })

  it('손실이 난 해는 보지 않는다(부호가 섞이면 크기 비교가 뜻을 잃는다)', () => {
    const { lines, warn } = collect()
    checkOrder([{ year: 2024, revenue: 100, operatingProfit: -150 }], 'year', pairs, warn, 'x')
    expect(lines).toEqual([])
  })

  it('정상 관계에는 조용하다', () => {
    const { lines, warn } = collect()
    checkOrder([{ year: 2024, revenue: 100, operatingProfit: 20 }], 'year', pairs, warn, 'x')
    expect(lines).toEqual([])
  })
})
