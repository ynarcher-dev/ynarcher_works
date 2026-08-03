import { describe, expect, it } from 'vitest'
import { buildTemplateCsv, parseBulkCsv, type BulkImportSpec } from '@/features/bulk/bulkImport'

const SPEC: BulkImportSpec = {
  noun: '펀드',
  table: 'funds',
  backTo: '/fund',
  templateName: '펀드_업로드_템플릿.csv',
  guide: '',
  invalidateKeys: [['fund']],
  fields: [
    { header: '펀드명', column: 'name', required: true, example: '1호 조합' },
    {
      header: '상태',
      column: 'status',
      kind: 'enum',
      labels: { RAISING: '결성 중', OPERATING: '운용 중' },
      aliases: ['status'],
      example: '운용 중',
    },
    { header: '결성일', column: 'formed_on', kind: 'date', example: '2026-01-15' },
    { header: '약정총액', column: 'total_commitment', kind: 'number', example: '3000000000' },
  ],
}

describe('parseBulkCsv', () => {
  it('라벨과 코드값을 모두 받는다(내려받은 데이터를 그대로 올릴 수 있게)', () => {
    const csv = ['펀드명,상태', 'A조합,운용 중', 'B조합,RAISING'].join('\n')
    const { rows, errors } = parseBulkCsv(csv, SPEC)
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { name: 'A조합', status: 'OPERATING' },
      { name: 'B조합', status: 'RAISING' },
    ])
  })

  it('빈 칸은 컬럼을 넣지 않는다 — DB 기본값이 살아야 한다', () => {
    const { rows } = parseBulkCsv(['펀드명,상태,결성일', 'A조합,,'].join('\n'), SPEC)
    expect(rows).toEqual([{ name: 'A조합' }])
  })

  it('필수 열이 헤더에 없으면 한 줄도 읽지 않고 그 사실만 알린다', () => {
    const { rows, errors } = parseBulkCsv(['상태', '운용 중'].join('\n'), SPEC)
    expect(rows).toEqual([])
    expect(errors[0]?.message).toContain('펀드명')
  })

  it('문제가 있는 줄만 오류로 빠지고 줄 번호는 파일 기준으로 돌려준다', () => {
    const csv = ['펀드명,상태,결성일,약정총액', 'A조합,없는상태,,', 'B조합,,2026/13/99,', 'C조합,,,삼십억'].join('\n')
    const { rows, errors } = parseBulkCsv(csv, SPEC)
    expect(rows).toEqual([])
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4])
    expect(errors[0]?.message).toContain('상태')
    expect(errors[1]?.message).toContain('YYYY-MM-DD')
    expect(errors[2]?.message).toContain('약정총액')
  })

  it('별칭 헤더(영문 컬럼명)와 날짜 구분자·금액 콤마를 받아 준다', () => {
    const csv = ['펀드명,status,결성일,약정총액', 'A조합,운용 중,2026.1.5,"3,000,000,000"'].join('\n')
    const { rows, errors } = parseBulkCsv(csv, SPEC)
    expect(errors).toEqual([])
    expect(rows[0]).toEqual({
      name: 'A조합',
      status: 'OPERATING',
      formed_on: '2026-01-05',
      total_commitment: 3_000_000_000,
    })
  })

  it('필수 열이 비어 있는 줄은 오류로 돌려보낸다', () => {
    const { rows, errors } = parseBulkCsv(['펀드명,상태', ',운용 중'].join('\n'), SPEC)
    expect(rows).toEqual([])
    expect(errors[0]?.message).toContain('펀드명')
  })

  it('고정값을 모든 행에 넣되 파일에 값이 있으면 그 값이 이긴다', () => {
    const spec = { ...SPEC, fixedValues: { status: 'RAISING' } }
    const { rows } = parseBulkCsv(['펀드명,상태', 'A조합,', 'B조합,운용 중'].join('\n'), spec)
    expect(rows).toEqual([
      { name: 'A조합', status: 'RAISING' },
      { name: 'B조합', status: 'OPERATING' },
    ])
  })

  it('빈 파일은 오류가 아니라 빈 결과다(열기만 해도 빨간 글씨가 뜨지 않게)', () => {
    expect(parseBulkCsv('', SPEC)).toEqual({ rows: [], preview: [], errors: [] })
  })
})

/** 태그 원장에서 고르는 값과 jsonb 안쪽 항목을 함께 받는 명세(스타트업 형태). */
const TAG_SPEC: BulkImportSpec = {
  noun: '스타트업',
  table: 'startups',
  backTo: '/startup',
  templateName: 't.csv',
  guide: '',
  invalidateKeys: [['startups']],
  fields: [
    { header: '기업명', column: 'name', required: true },
    { header: '한 줄 소개', column: 'business_profile.oneLiner' },
    { header: '강점', column: 'business_profile.competitiveEdge' },
    {
      header: '분야',
      column: 'industries',
      kind: 'tags',
      tagTable: 'industry_tags',
      max: 2,
      mirrorColumn: 'industry',
      // '산업'은 2026-08-03 이전 표기(실제 STARTUP_BULK_SPEC과 같은 별칭 구성).
      aliases: ['산업'],
    },
    { header: '단계', column: 'stage', kind: 'tag', tagTable: 'investment_stage_tags' },
    { header: '연락처', column: 'phone', kind: 'phone' },
  ],
}

const TAGS = { industry_tags: ['SaaS', '핀테크', '바이오'], investment_stage_tags: ['Seed', 'Series A'] }

describe('parseBulkCsv — 태그·배열·중첩 컬럼', () => {
  it('태그 원장에 있는 이름만 받는다(오타는 조용히 저장되지 않는다)', () => {
    const csv = ['기업명,단계', 'A사,Seed', 'B사,씨드'].join('\n')
    const { rows, errors } = parseBulkCsv(csv, TAG_SPEC, TAGS)
    expect(rows).toEqual([{ name: 'A사', stage: 'Seed' }])
    expect(errors.map((e) => e.line)).toEqual([3])
    expect(errors[0]?.message).toContain('ADMIN 태그 관리')
  })

  it('분야는 세미콜론으로 나눠 배열로 넣고 대표값을 스칼라에 미러링한다', () => {
    const { rows, errors } = parseBulkCsv(['기업명,분야', 'A사,SaaS;핀테크'].join('\n'), TAG_SPEC, TAGS)
    expect(errors).toEqual([])
    expect(rows[0]).toEqual({ name: 'A사', industries: ['SaaS', '핀테크'], industry: 'SaaS' })
  })

  // 표기가 '산업'에서 '분야'로 바뀌기 전에 내려받은 템플릿이 그대로 올라와도 열이 유실되면 안 된다.
  it('구 표기 헤더(산업)로 올려도 같은 컬럼으로 들어간다', () => {
    const { rows, errors } = parseBulkCsv(['기업명,산업', 'A사,SaaS'].join('\n'), TAG_SPEC, TAGS)
    expect(errors).toEqual([])
    expect(rows[0]).toEqual({ name: 'A사', industries: ['SaaS'], industry: 'SaaS' })
  })

  it('다중 태그 상한을 넘으면 그 줄을 돌려보낸다', () => {
    const csv = ['기업명,분야', 'A사,SaaS;핀테크;바이오'].join('\n')
    const { rows, errors } = parseBulkCsv(csv, TAG_SPEC, TAGS)
    expect(rows).toEqual([])
    expect(errors[0]?.message).toContain('최대 2개')
  })

  it('점 표기 열들은 한 jsonb 컬럼으로 모인다(뒤 열이 앞 열을 덮지 않는다)', () => {
    const csv = ['기업명,한 줄 소개,강점', 'A사,한 줄,우리 강점'].join('\n')
    const { rows } = parseBulkCsv(csv, TAG_SPEC, TAGS)
    expect(rows[0]).toEqual({
      name: 'A사',
      business_profile: { oneLiner: '한 줄', competitiveEdge: '우리 강점' },
    })
  })

  it('연락처는 표기를 걷어내고 숫자만 저장한다', () => {
    const { rows } = parseBulkCsv(['기업명,연락처', 'A사,010-1234-5678'].join('\n'), TAG_SPEC, TAGS)
    expect(rows[0]).toEqual({ name: 'A사', phone: '01012345678' })
  })

  it('태그 원장을 못 읽었으면 그 열은 검증하지 않는다(빈 스냅숏으로 전부 막지 않는다)', () => {
    const { rows, errors } = parseBulkCsv(['기업명,단계', 'A사,씨드'].join('\n'), TAG_SPEC, {})
    expect(errors).toEqual([])
    expect(rows[0]).toEqual({ name: 'A사', stage: '씨드' })
  })
})

describe('buildTemplateCsv', () => {
  it('헤더 순서와 예시 한 줄을 내보내고 콤마가 든 예시는 따옴표로 감싼다', () => {
    const spec = {
      ...SPEC,
      fields: [...SPEC.fields, { header: '비고', column: 'note', example: 'a,b' }],
    }
    const [header, example] = buildTemplateCsv(spec).split('\n')
    expect(header).toBe('펀드명,상태,결성일,약정총액,비고')
    expect(example).toBe('1호 조합,운용 중,2026-01-15,3000000000,"a,b"')
  })
})
