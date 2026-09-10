import { describe, expect, it } from 'vitest'
import type { PersonaMatch } from '@/features/program/ledgerMatch'
import {
  buildEntries,
  buildTemplateCsv,
  parseBulkCsv,
  summarize,
  type BulkRow,
} from '@/features/program/rosterBulk'

/** 기업 자격 — 이름과 명의가 갈리는 쪽이다(전문가는 아래 시험이 따로 본다). */
const MASTER = 'startups' as const

/**
 * 갖춰진 원장 행이 기본이다 — 명의·이메일·연락처가 없으면 담기지 않는 것이 규칙이라
 * (2026-09-10), 비어 있는 픽스처를 기본으로 두면 모든 시험이 그 한 가지만 확인하게 된다.
 */
const match = (
  id: string,
  name: string,
  extra: Partial<PersonaMatch> = {},
): PersonaMatch => ({
  id,
  name,
  loginName: '이대표',
  subtitle: '',
  email: 'm@x.com',
  phone: '010-0000-0000',
  category: null,
  retired: false,
  hits: 2,
  ...extra,
})

const row = (line: number, name: string, extra: Partial<BulkRow> = {}): BulkRow => ({
  line,
  name,
  contactName: '이대표',
  email: 'a@x.com',
  phone: '010-1111-2222',
  ...extra,
})

describe('parseBulkCsv', () => {
  it('자격마다 다른 머리글을 같은 칸으로 읽는다', () => {
    const rows = parseBulkCsv('기업명,담당자,이메일,연락처\n이카이스,이준엽,a@x.com,010-1111-2222')
    expect(rows).toEqual([
      { line: 2, name: '이카이스', contactName: '이준엽', email: 'a@x.com', phone: '010-1111-2222' },
    ])
  })

  it('전문가 템플릿(성명 머리글)도 이름 칸으로 들어온다', () => {
    const rows = parseBulkCsv('성명,이메일\n홍길동,hong@x.com')
    expect(rows[0]?.name).toBe('홍길동')
    expect(rows[0]?.email).toBe('hong@x.com')
  })

  it('모르는 열은 무시하고 순서가 달라도 이름으로 찾는다', () => {
    const rows = parseBulkCsv('메모,연락처,기업명\n무시,010-0000-0000,뉴런랩스')
    expect(rows[0]?.name).toBe('뉴런랩스')
    expect(rows[0]?.phone).toBe('010-0000-0000')
  })

  it('이름이 빈 줄은 버린다 — 대조도 등록도 성립하지 않는다', () => {
    const rows = parseBulkCsv('기업명,이메일\n,a@x.com\n딜챗,b@x.com')
    expect(rows.map((r) => r.name)).toEqual(['딜챗'])
  })

  it('원본 줄 번호를 들고 다닌다(빈 줄을 건너뛰어도)', () => {
    const rows = parseBulkCsv('기업명\n딜챗\n\n뉴런랩스')
    expect(rows.map((r) => r.line)).toEqual([2, 4])
  })
})

describe('buildEntries', () => {
  it('원장에 있으면 담기, 없으면 신규 등록이 기본이다', () => {
    const entries = buildEntries(MASTER, 
      [row(2, '딜챗'), row(3, '없는회사')],
      new Map([[0, match('m1', '딜챗')]]),
      new Set(),
    )
    expect(entries[0]?.decision).toBe('link')
    expect(entries[1]?.decision).toBe('create')
  })

  it('이미 담긴 대상은 제외로 잠긴다', () => {
    const entries = buildEntries(MASTER, [row(2, '딜챗')], new Map([[0, match('m1', '딜챗')]]), new Set(['m1']))
    expect(entries[0]?.decision).toBe('skip')
    expect(entries[0]?.alreadyMapped).toBe(true)
  })

  it('파일 안에서 같은 원장 행을 두 번 가리키면 뒤엣줄을 접는다', () => {
    const entries = buildEntries(MASTER, 
      [row(2, '딜챗'), row(3, 'Dealchat')],
      new Map([
        [0, match('m1', '딜챗')],
        [1, match('m1', '딜챗')],
      ]),
      new Set(),
    )
    expect(entries[0]?.decision).toBe('link')
    expect(entries[1]?.decision).toBe('skip')
  })

  it('신규끼리의 파일 내 중복도 접는다 — 막으려던 중복을 우리가 만들지 않는다', () => {
    const entries = buildEntries(MASTER, 
      [row(2, '새회사'), row(3, '새회사')],
      new Map(),
      new Set(),
    )
    expect(entries.map((e) => e.decision)).toEqual(['create', 'skip'])
  })

  it('이름이 같아도 이메일이 다르면 각각 신규다', () => {
    const entries = buildEntries(MASTER, 
      [row(2, '새회사'), row(3, '새회사', { email: 'b@x.com' })],
      new Map(),
      new Set(),
    )
    expect(entries.map((e) => e.decision)).toEqual(['create', 'create'])
  })

  it('원장이 비어 있으면 담기지 않는다 — 담긴 것은 계정을 열 수 있어야 한다', () => {
    const entries = buildEntries(
      MASTER,
      [row(2, '딜챗')],
      new Map([[0, match('m1', '딜챗', { email: null, phone: null })]]),
      new Set(),
    )
    expect(entries[0]?.decision).toBe('skip')
    expect(entries[0]?.gaps).toEqual(['email', 'phone'])
  })

  it('새로 만드는 줄은 파일의 값이 답한다 — 빠진 칸이 있으면 만들지 않는다', () => {
    const entries = buildEntries(
      MASTER,
      [row(2, '새회사', { email: '' })],
      new Map(),
      new Set(),
    )
    expect(entries[0]?.decision).toBe('skip')
    expect(entries[0]?.gaps).toEqual(['email'])
  })

  it('전문가는 이름이 곧 명의라 명의 열이 없어도 갖춰진 것이다', () => {
    const entries = buildEntries(
      'networks',
      [row(2, '홍길동', { contactName: '' })],
      new Map(),
      new Set(),
    )
    expect(entries[0]?.decision).toBe('create')
    expect(entries[0]?.gaps).toEqual([])
  })

  it('비활성 행에 걸려도 담기가 기본이다 — 있는 것을 없다고 하지 않는다', () => {
    const entries = buildEntries(MASTER, [row(2, '딜챗')], new Map([[0, match('m1', '딜챗', { retired: true })]]), new Set())
    expect(entries[0]?.decision).toBe('link')
    expect(entries[0]?.match?.retired).toBe(true)
  })
})

describe('summarize', () => {
  it('결정별 건수를 센다', () => {
    const entries = buildEntries(MASTER, 
      [row(2, '딜챗'), row(3, '없는회사'), row(4, '담긴회사')],
      new Map([
        [0, match('m1', '딜챗')],
        [2, match('m2', '담긴회사')],
      ]),
      new Set(['m2']),
    )
    expect(summarize(entries)).toEqual({ link: 1, create: 1, skip: 1 })
  })
})

describe('buildTemplateCsv', () => {
  it('기업 자격은 명의 열을 세운다', () => {
    expect(buildTemplateCsv('startups').split('\n')[0]).toBe('기업명,대표자,이메일,연락처')
  })

  it('대상이 곧 사람인 자격은 명의 열을 두지 않는다', () => {
    expect(buildTemplateCsv('networks').split('\n')[0]).toBe('전문가명,이메일,연락처')
  })

  it('M&A도 그 자격이 부르는 말로 적는다', () => {
    expect(buildTemplateCsv('ma_sellers').split('\n')[0]).toBe('기업명,담당자,이메일,연락처')
  })
})
