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

function csv(...lines: string[]): string {
  return [header, ...lines].join('\n')
}

describe('parseAssetCsv', () => {
  it('템플릿 예시는 그대로 통과한다 — 사용자가 처음 받는 파일이 실패하면 안 된다', () => {
    const { rows, errors } = parseAssetCsv(buildAssetTemplateCsv(), refs)
    expect(errors).toEqual([])
    expect(rows).toHaveLength(2)
    expect(rows[0]!.name).toBe('MacBook Pro 16 (2025)')
    expect(rows[0]!.isPortable).toBe(true)
    expect(rows[1]!.billingCycle).toBe('MONTHLY')
    expect(rows[1]!.amount).toBe(55000)
  })

  it('라벨과 코드값을 모두 받는다(내려받은 데이터를 그대로 올릴 수 있게)', () => {
    const { rows, errors } = parseAssetCsv(
      csv(
        '노트북A,본사,노트북,구매,가용,,S1,2026-01-01,,,1000,완납,O,',
        '노트북B,본사,노트북,PURCHASE,AVAILABLE,,S2,2026-01-01,,,1000,ONE_TIME,X,',
      ),
      refs,
    )
    expect(errors).toEqual([])
    expect(rows.map((r) => r.acquisitionType)).toEqual(['PURCHASE', 'PURCHASE'])
  })

  it('빈 칸은 기본값으로 떨어진다(구매·가용·완납·반출 불가)', () => {
    const { rows } = parseAssetCsv(csv('의자,본사,,,,,,,,,,,,'), refs)
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
    const { rows, errors } = parseAssetCsv(csv('책상,본사,비품,구매,가용,,,2026.3.1,2026/12/31,,50000,완납,X,'), refs)
    expect(errors).toEqual([])
    expect(rows[0]!.acquiredOn).toBe('2026-03-01')
    expect(rows[0]!.returnDue).toBe('2026-12-31')
  })

  it('할당 대상을 이름으로 찾아 id로 바꾼다', () => {
    const { rows } = parseAssetCsv(csv('노트북,본사,노트북,구매,할당됨,홍길동,,,,,,,X,'), refs)
    expect(rows[0]!.assignedTo).toBe('u-hong')
  })

  it('폐기일자가 있으면 상태·할당을 화면과 같은 규칙으로 끌고 간다', () => {
    const { rows, errors } = parseAssetCsv(
      csv('구형노트북,본사,노트북,구매,할당됨,홍길동,,2020-01-01,,2026-01-31,900000,완납,X,'),
      refs,
    )
    expect(errors).toEqual([])
    expect(rows[0]!.status).toBe('RETIRED')
    expect(rows[0]!.assignedTo).toBeNull()
  })

  describe('줄 단위 오류', () => {
    it('모르는 지사는 그 줄만 빠진다', () => {
      const { rows, errors } = parseAssetCsv(
        csv('A,본사,,,,,,,,,,,,', 'B,없는지사,,,,,,,,,,,,'),
        refs,
      )
      expect(rows).toHaveLength(1)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatchObject({ line: 3 })
      expect(errors[0]!.message).toContain('없는지사')
    })

    it('동명이인은 사람을 특정할 수 없다고 알린다', () => {
      const { errors } = parseAssetCsv(csv('A,본사,,,할당됨,김철수,,,,,,,X,'), refs)
      expect(errors[0]!.message).toContain('여러 명')
    })

    it('알 수 없는 라벨·형식은 무엇이 틀렸는지 적는다', () => {
      const bad = parseAssetCsv(
        csv('A,본사,,렌트,,,,,,,,,,', 'B,본사,,,,,,13월1일,,,,,,', 'C,본사,,,,,,,,,,,예,'),
        refs,
      )
      expect(bad.rows).toHaveLength(0)
      expect(bad.errors.map((e) => e.line)).toEqual([2, 3, 4])
      expect(bad.errors[0]!.message).toContain('분류')
      expect(bad.errors[1]!.message).toContain('YYYY-MM-DD')
      expect(bad.errors[2]!.message).toContain('반출가능')
    })

    it('폼과 같은 검증을 통과해야 한다 — 할당됨인데 대상이 없으면 거부', () => {
      const { errors } = parseAssetCsv(csv('A,본사,,,할당됨,,,,,,,,,'), refs)
      expect(errors[0]!.message).toContain('할당 대상')
    })

    it('자산명이 비면 거부한다', () => {
      const { errors } = parseAssetCsv(csv(',본사,,,,,,,,,,,,'), refs)
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
