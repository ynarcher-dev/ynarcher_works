import { describe, expect, it } from 'vitest'
import {
  CUSTOMER_KIND_OPTIONS,
  DEV_INSOURCING_OPTIONS,
  DEV_STAGE_OPTIONS,
  EMPLOYMENT_OPTIONS,
  GOV_ROLE_OPTIONS,
  IP_KIND_OPTIONS,
  IP_STATUS_OPTIONS,
} from './cards.ts'
import { buildIndex } from '../_shared/aiFill/chunks.ts'
import { normalizeEnvelope as runEnvelope } from '../_shared/aiFill/envelope.ts'
import { CARD_SHAPE, LIMITS, type CardKey } from './cards.ts'
import { normalizeCard } from './validate.ts'
import {
  CUSTOMER_KIND_OPTIONS as UI_CUSTOMER_KIND,
} from '@/features/startup/startupGrowth'
import {
  DEV_INSOURCING_OPTIONS as UI_DEV_INSOURCING,
  DEV_STAGE_OPTIONS as UI_DEV_STAGE,
  EMPLOYMENT_OPTIONS as UI_EMPLOYMENT,
  GOV_ROLE_OPTIONS as UI_GOV_ROLE,
  IP_KIND_OPTIONS as UI_IP_KIND,
  IP_STATUS_OPTIONS as UI_IP_STATUS,
} from '@/features/startup/startupProfile'

/**
 * 모델 응답 정규화 회귀 테스트.
 *
 * 두 가지를 본다 — (1) 화면의 고정 선택지와 함수의 목록이 **같은지**(어긋나면 모델이 화면에
 * 없는 값을 채운다), (2) 규격 밖 값이 조용히 지워지지 않고 **경고를 남기며** 비워지는지.
 * 조용히 지우면 담당자는 "AI가 못 찾았다"와 "AI가 채웠는데 규격에 안 맞았다"를 가를 수 없다.
 */

/**
 * 봉투 정규화의 시험 진입점.
 *
 * 봉투 자체는 엔진이 소유하므로(요청하지 않은 카드 버리기·빈 카드 되돌리기·notes 다듬기)
 * 여기서 재는 것은 **이 프로파일의 카드 규격**이다. 근거 대조는 빈 지도로 돌린다 — 그 판정은
 * `_shared/aiFill/evidence.test.ts`가 따로 본다.
 */
const EMPTY_INDEX = buildIndex([], [])
const normalizeEnvelope = (parsed: unknown, cards: CardKey[], opts: { locations?: string[] } = {}) =>
  runEnvelope(parsed, cards, {
    normalizeCard: (key, raw, warn) => normalizeCard(key, raw, warn, opts.locations ?? []),
    cardShape: CARD_SHAPE,
    index: EMPTY_INDEX,
    maxNotes: LIMITS.notes,
  }).envelope

describe('고정 선택지 — 화면과 함수가 한 벌인가', () => {
  it('일곱 목록이 프론트 상수와 같다', () => {
    expect([...DEV_STAGE_OPTIONS]).toEqual([...UI_DEV_STAGE])
    expect([...DEV_INSOURCING_OPTIONS]).toEqual([...UI_DEV_INSOURCING])
    expect([...EMPLOYMENT_OPTIONS]).toEqual([...UI_EMPLOYMENT])
    expect([...IP_KIND_OPTIONS]).toEqual([...UI_IP_KIND])
    expect([...IP_STATUS_OPTIONS]).toEqual([...UI_IP_STATUS])
    expect([...GOV_ROLE_OPTIONS]).toEqual([...UI_GOV_ROLE])
    expect([...CUSTOMER_KIND_OPTIONS]).toEqual([...UI_CUSTOMER_KIND])
  })
})

describe('normalizeEnvelope — 규격 밖 값', () => {
  it('선택지 밖 개발 단계는 비우고 원문을 notes에 남긴다', () => {
    const out = normalizeEnvelope({ cards: { tech: { product: 'A', devStage: '베타' } } }, ['tech'])
    const tech = out.cards.tech as Record<string, unknown>
    expect(tech.devStage).toBeNull()
    expect(out.notes.tech?.join(' ')).toContain('베타')
  })

  it('연도만 있는 연혁 항목은 행을 만들지 않는다', () => {
    const out = normalizeEnvelope(
      { cards: { timeline: [{ date: '2024', content: '설립' }, { date: '2024-03', content: '출시' }] } },
      ['timeline'],
    )
    expect(out.cards.timeline).toEqual([{ date: '2024-03', content: '출시' }])
    expect(out.notes.timeline?.join(' ')).toContain('2024')
  })

  it('금액에 섞인 쉼표·통화기호를 숫자로 읽는다', () => {
    const out = normalizeEnvelope(
      { cards: { revenue: { revenue: [{ year: 2024, revenue: '1,250,000,000' }], finance: [] } } },
      ['revenue'],
    )
    const card = out.cards.revenue as Record<string, unknown>
    expect((card.revenue as Record<string, unknown>[])[0].revenue).toBe(1_250_000_000)
  })

  it('지분율 합이 어긋나면 값을 고치지 않고 경고만 남긴다', () => {
    const out = normalizeEnvelope(
      {
        cards: {
          shareholders: [
            { date: '2024-01-01', holders: [{ name: '대표', percentage: 60 }, { name: '투자자', percentage: 30 }] },
          ],
        },
      },
      ['shareholders'],
    )
    const snap = (out.cards.shareholders as Record<string, unknown>[])[0]
    expect((snap.holders as Record<string, unknown>[])[0].percentage).toBe(60)
    expect(out.notes.shareholders?.join(' ')).toContain('확인 필요')
  })

  it('언급 없는 지분 보유는 false가 아니라 null이고, 그 사실을 notes가 말한다', () => {
    const out = normalizeEnvelope({ cards: { team: { members: [{ name: '홍길동' }] } } }, ['team'])
    const team = out.cards.team as Record<string, unknown>
    expect((team.members as Record<string, unknown>[])[0].hasEquity).toBeNull()
    // 폼의 칸이 boolean이라 null은 화면에서 '없음'으로 눕는다. 경고가 없으면 확인하지 못한 것이
    // 확인해서 없는 것으로 굳는다.
    expect(out.notes.team?.join(' ')).toContain('지분 보유 미확인: 홍길동')
  })

  it('지분 보유가 명시된 팀원만 있으면 경고를 남기지 않는다', () => {
    const out = normalizeEnvelope(
      { cards: { team: { members: [{ name: '홍길동', hasEquity: true }, { name: '김철수', hasEquity: false }] } } },
      ['team'],
    )
    expect(out.notes.team?.join(' ') ?? '').not.toContain('지분 보유 미확인')
  })

  it('이름 없는 행은 버린다(가짜 행을 만들지 않는다)', () => {
    const out = normalizeEnvelope(
      { cards: { ip: { rights: [{ kind: '특허' }, { kind: '특허', title: '진짜' }], certifications: [], govProjects: [] } } },
      ['ip'],
    )
    expect((out.cards.ip as Record<string, unknown>).rights).toHaveLength(1)
  })
})

describe('normalizeEnvelope — 빈 카드와 요청 범위', () => {
  it('값 없는 키만 가득한 객체 카드는 null로 되돌린다', () => {
    const out = normalizeEnvelope({ cards: { business: { oneLiner: null, businessModel: '' } } }, ['business'])
    expect(out.cards.business).toBeNull()
  })

  it('목록 카드가 비면 빈 배열로 답한다', () => {
    const out = normalizeEnvelope({ cards: { employee: [] } }, ['employee'])
    expect(out.cards.employee).toEqual([])
  })

  it('요청하지 않은 카드는 응답에 섞여 와도 버린다', () => {
    const out = normalizeEnvelope({ cards: { business: { oneLiner: 'A' }, tech: { product: 'B' } } }, ['business'])
    expect(out.cards.tech).toBeUndefined()
  })

  it('응답이 통째로 어긋나도 요청한 카드 키는 모두 답한다', () => {
    const out = normalizeEnvelope('망가진 값', ['business', 'employee'])
    expect(out.cards.business).toBeNull()
    expect(out.cards.employee).toEqual([])
  })
})

describe('normBasics — 서류에 인쇄된 값만 통과한다', () => {
  const basics = (o: Record<string, unknown>, locations = ['서울특별시', '경기도', '해외']) =>
    normalizeEnvelope({ cards: { basics: o } }, ['basics'], { locations })

  it('사업자등록번호는 숫자 10자리를 형식에 맞춰 돌려준다', () => {
    const out = basics({ bizRegNo: '1234567890' })
    expect((out.cards.basics as Record<string, unknown>).bizRegNo).toBe('123-45-67890')
  })

  it('법인등록번호(13자리)를 잘못 읽어 오면 비우고 경고를 남긴다', () => {
    const out = basics({ name: '주식회사 가', bizRegNo: '110111-1234567' })
    expect((out.cards.basics as Record<string, unknown>).bizRegNo).toBeNull()
    expect(out.notes.basics?.join(' ')).toContain('사업자등록번호')
  })

  it('설립일은 일 단위까지 있어야 한다(폼의 date 칸에 월만으로는 못 들어간다)', () => {
    const out = basics({ name: '가', foundedOn: '2021-03' })
    expect((out.cards.basics as Record<string, unknown>).foundedOn).toBeNull()
    expect(out.notes.basics?.join(' ')).toContain('설립일')
  })

  it('소재지는 원장 목록 밖이면 비운다(셀렉트에 없는 값이 폼에 앉지 않게)', () => {
    const out = basics({ name: '가', location: '서울' })
    expect((out.cards.basics as Record<string, unknown>).location).toBeNull()
    expect(out.notes.basics?.join(' ')).toContain('소재지')
  })

  it('소재지 목록을 못 받았으면 통과시키지 않고 그 사실을 말한다', () => {
    const out = basics({ name: '가', location: '서울특별시' }, [])
    expect((out.cards.basics as Record<string, unknown>).location).toBeNull()
    expect(out.notes.basics?.join(' ')).toContain('불러오지 못해')
  })

  it('회사 형태는 세 값 밖이면 비운다', () => {
    const out = basics({ name: '가', companyForm: '주식회사' })
    expect((out.cards.basics as Record<string, unknown>).companyForm).toBeNull()
  })
})

describe('normSummary — 판단하는 유일한 카드', () => {
  const summary = (o: Record<string, unknown>) => normalizeEnvelope({ cards: { summary: o } }, ['summary'])

  it('축마다 세 줄까지만 남긴다(폼의 입력 칸이 축마다 셋이다)', () => {
    const out = summary({ strengths: ['1', '2', '3', '4'], improvements: [], needs: [] })
    expect((out.cards.summary as Record<string, unknown>).strengths).toEqual(['1', '2', '3'])
  })

  it('빈 줄은 떨어뜨린다', () => {
    const out = summary({ strengths: ['강점', '  ', ''], improvements: [], needs: [] })
    expect((out.cards.summary as Record<string, unknown>).strengths).toEqual(['강점'])
  })

  it('세 축이 모두 비면 카드 전체를 null로 돌려준다(기존 값 유지로 읽힌다)', () => {
    const out = summary({ strengths: [], improvements: [], needs: [] })
    expect(out.cards.summary).toBeNull()
  })
})
