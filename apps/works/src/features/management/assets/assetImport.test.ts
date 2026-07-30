import { describe, expect, it } from 'vitest'
import {
  ASSET_IMPORT_HEADERS,
  buildAssetTemplateCsv,
  parseAssetCsv,
  type ImportRefs,
} from '@/features/management/assets/assetImport'

const refs: ImportRefs = {
  branches: [
    { id: 'b-main', name: '본사' },
    { id: 'b-daegu', name: '대구 센터' },
  ],
  employees: [
    { id: 'u-hong', name: '홍길동' },
    { id: 'u-kim1', name: '김철수' },
    { id: 'u-kim2', name: '김철수' },
  ],
}

const header = ASSET_IMPORT_HEADERS.join(',')

type Cells = Partial<Record<(typeof ASSET_IMPORT_HEADERS)[number], string>>

/**
 * 한 줄을 열 이름으로 쓴다. 자리(쉼표 개수)로 적으면 열 순서를 바꿀 때마다 사례가 조용히 어긋나고,
 * 무엇을 시험하는 줄인지도 읽히지 않는다. 적지 않은 열은 빈 칸이다.
 */
function line(cells: Cells): string {
  return ASSET_IMPORT_HEADERS.map((h) => cells[h] ?? '').join(',')
}

function csv(...rows: Cells[]): string {
  return [header, ...rows.map(line)].join('\n')
}

describe('parseAssetCsv', () => {
  it('템플릿 예시는 그대로 통과한다 — 사용자가 처음 받는 파일이 실패하면 안 된다', () => {
    const { rows, errors } = parseAssetCsv(buildAssetTemplateCsv(), refs)
    expect(errors).toEqual([])
    expect(rows).toHaveLength(2)
    expect(rows[0]!.name).toBe('MacBook Pro 16 (2025)')
    expect(rows[0]!.serialNo).toBe('C02X1234ABCD')
    expect(rows[0]!.isPortable).toBe(true)
    expect(rows[1]!.billingCycle).toBe('MONTHLY')
    expect(rows[1]!.amount).toBe(55000)
    expect(rows[1]!.returnDue).toBe('2027-12-31')
  })

  it('라벨과 코드값을 모두 받는다(내려받은 데이터를 그대로 올릴 수 있게)', () => {
    const { rows, errors } = parseAssetCsv(
      csv(
        { 자산명: '노트북A', 지사: '본사', 분류: '구매', 상태: '보유', 결제주기: '완납' },
        {
          자산명: '노트북B',
          지사: '본사',
          분류: 'PURCHASE',
          상태: 'AVAILABLE',
          결제주기: 'ONE_TIME',
        },
      ),
      refs,
    )
    expect(errors).toEqual([])
    expect(rows.map((r) => r.acquisitionType)).toEqual(['PURCHASE', 'PURCHASE'])
    expect(rows.map((r) => r.status)).toEqual(['AVAILABLE', 'AVAILABLE'])
  })

  it('빈 칸은 기본값으로 떨어진다(구매·보유·완납·반출 불가)', () => {
    const { rows } = parseAssetCsv(csv({ 자산명: '의자', 지사: '본사' }), refs)
    expect(rows[0]).toMatchObject({
      acquisitionType: 'PURCHASE',
      status: 'AVAILABLE',
      billingCycle: 'ONE_TIME',
      isPortable: false,
      amount: null,
      serialNo: null,
    })
  })

  it('엑셀이 흔히 쓰는 점·슬래시 날짜를 하이픈으로 맞춘다', () => {
    const { rows, errors } = parseAssetCsv(
      csv({ 자산명: '책상', 지사: '본사', 취득일자: '2026.3.1', 만료일: '2026/12/31' }),
      refs,
    )
    expect(errors).toEqual([])
    expect(rows[0]!.acquiredOn).toBe('2026-03-01')
    expect(rows[0]!.returnDue).toBe('2026-12-31')
  })

  it('할당 대상을 이름으로 찾아 id로 바꾼다', () => {
    const { rows } = parseAssetCsv(
      csv({ 자산명: '노트북', 지사: '본사', 상태: '할당', 할당대상: '홍길동' }),
      refs,
    )
    expect(rows[0]!.assignedTo).toBe('u-hong')
  })

  describe('끝나는 날', () => {
    it('폐기 상태면 만료일이 폐기일자로 저장된다 — 한 칸이 상태에 따라 갈린다', () => {
      const { rows, errors } = parseAssetCsv(
        csv({ 자산명: '구형노트북', 지사: '본사', 상태: '폐기', 만료일: '2026-01-31' }),
        refs,
      )
      expect(errors).toEqual([])
      expect(rows[0]!.disposedOn).toBe('2026-01-31')
      expect(rows[0]!.returnDue).toBeNull()
    })

    it('옛 템플릿의 폐기일자 열도 계속 읽고, 그 값이 있으면 상태·할당을 끌고 간다', () => {
      const legacy = [
        '자산명,지사,상태,할당대상,폐기일자',
        '구형노트북,본사,할당,홍길동,2026-01-31',
      ].join('\n')
      const { rows, errors } = parseAssetCsv(legacy, refs)
      expect(errors).toEqual([])
      expect(rows[0]!.status).toBe('RETIRED')
      expect(rows[0]!.disposedOn).toBe('2026-01-31')
      // 폐기한 물건에 소유자를 남기지 않는다(화면의 상태 전이와 같은 규칙).
      expect(rows[0]!.assignedTo).toBeNull()
    })

    it('두 열이 함께 있으면 폐기일자가 이긴다', () => {
      const both = [
        '자산명,지사,만료일,폐기일자',
        '구형노트북,본사,2027-12-31,2026-01-31',
      ].join('\n')
      const { rows } = parseAssetCsv(both, refs)
      expect(rows[0]!.disposedOn).toBe('2026-01-31')
      expect(rows[0]!.returnDue).toBeNull()
    })
  })

  describe('줄 단위 오류', () => {
    it('모르는 지사는 그 줄만 빠진다', () => {
      const { rows, errors } = parseAssetCsv(
        csv({ 자산명: 'A', 지사: '본사' }, { 자산명: 'B', 지사: '없는지사' }),
        refs,
      )
      expect(rows).toHaveLength(1)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatchObject({ line: 3 })
      expect(errors[0]!.message).toContain('없는지사')
    })

    it('동명이인은 사람을 특정할 수 없다고 알린다', () => {
      const { errors } = parseAssetCsv(
        csv({ 자산명: 'A', 지사: '본사', 상태: '할당', 할당대상: '김철수' }),
        refs,
      )
      expect(errors[0]!.message).toContain('여러 명')
    })

    it('알 수 없는 라벨·형식은 무엇이 틀렸는지 적는다', () => {
      const bad = parseAssetCsv(
        csv(
          { 자산명: 'A', 지사: '본사', 분류: '렌트' },
          { 자산명: 'B', 지사: '본사', 취득일자: '13월1일' },
          { 자산명: 'C', 지사: '본사', 반출가능: '예' },
        ),
        refs,
      )
      expect(bad.rows).toHaveLength(0)
      expect(bad.errors.map((e) => e.line)).toEqual([2, 3, 4])
      expect(bad.errors[0]!.message).toContain('분류')
      expect(bad.errors[1]!.message).toContain('YYYY-MM-DD')
      expect(bad.errors[2]!.message).toContain('반출가능')
    })

    it('폼과 같은 검증을 통과해야 한다 — 할당인데 대상이 없으면 거부', () => {
      const { errors } = parseAssetCsv(csv({ 자산명: 'A', 지사: '본사', 상태: '할당' }), refs)
      expect(errors[0]!.message).toContain('할당 대상')
    })

    it('끝나는 날이 취득일자보다 앞서면 거부한다', () => {
      const { errors } = parseAssetCsv(
        csv({ 자산명: 'A', 지사: '본사', 취득일자: '2026-03-01', 만료일: '2026-02-28' }),
        refs,
      )
      expect(errors[0]!.message).toContain('취득일자')
    })

    it('자산명이 비면 거부한다', () => {
      const { errors } = parseAssetCsv(csv({ 지사: '본사' }), refs)
      expect(errors[0]!.message).toContain('자산명')
    })
  })

  it('헤더에 필수 열이 없으면 파일 전체를 되돌린다', () => {
    const { rows, errors } = parseAssetCsv('품목,금액\n노트북,1000', refs)
    expect(rows).toEqual([])
    expect(errors[0]).toMatchObject({ line: 1 })
  })

  it('빈 파일은 오류 없이 빈 결과다', () => {
    expect(parseAssetCsv('', refs)).toEqual({ rows: [], errors: [] })
  })
})
