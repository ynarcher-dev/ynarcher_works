/**
 * 송금 요청 표의 **열 순서와 짝**이 시드와 화면에서 같은지 본다.
 *
 * 화면 쪽 규칙(파생 열은 읽기 전용이고 이름 사본은 열로 서지 않는다)은 `fields.ts`가 갖고,
 * 그 규칙이 실제로 적용되는 열 한 벌은 **마이그레이션이 정한다**. 두 곳이 갈리면 아무 검사도
 * 실패하지 않은 채로 화면에 빈 칸이 서거나(짝이 어긋난 파생 열) 같은 값이 두 번 선다.
 *
 * 그래서 이 테스트는 스키마를 TS로 **다시 적지 않고** 마이그레이션 SQL에서 뽑아 읽는다.
 * DB가 없어도 도는 검사이며(로컬 Docker·psql이 없다), 여기서 통과한다고 운영 DB에 적용된
 * 것은 아니다 — 적용 여부는 객체로 판별한다.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseFields, visibleColumns, type FormColumn } from './fields'

const MIGRATION = fileURLToPath(
  new URL(
    '../../../../../supabase/migrations/20260915041117_approval_expense_remittance_partner_snapshot.sql',
    import.meta.url,
  ),
)

/**
 * 시드가 세우는 `v_cols` 한 벌을 읽는다.
 *
 * `jsonb_build_object('key', …)`로 시작하는 덩어리만 센다 — 파생 열 안쪽의
 * `jsonb_build_object('from', …)`는 `'key',`로 시작하지 않아 이 셈에 걸리지 않는다.
 */
function seedColumns(): FormColumn[] {
  const sql = readFileSync(MIGRATION, 'utf8')
  const start = sql.indexOf('v_cols := jsonb_build_array(')
  expect(start).toBeGreaterThan(-1)
  const end = sql.indexOf('\n  );', start)
  expect(end).toBeGreaterThan(start)
  const block = sql.slice(start, end)

  const pick = (chunk: string, name: string): string | undefined =>
    new RegExp(`'${name}',\\s*'([^']*)'`).exec(chunk)?.[1]

  return block
    .split("jsonb_build_object('key',")
    .slice(1)
    .map((chunk) => {
      const key = /^\s*'([^']+)'/.exec(chunk)?.[1] ?? ''
      const column: FormColumn = {
        key,
        label: pick(chunk, 'label') ?? '',
        type: (pick(chunk, 'type') ?? '') as FormColumn['type'],
      }
      const from = pick(chunk, 'from')
      const field = pick(chunk, 'field')
      if (from && field) {
        column.source = { from, field: field as NonNullable<FormColumn['source']>['field'] }
      }
      return column
    })
}

describe('송금 요청 양식 시드', () => {
  it('열 여덟 개가 정해진 순서로 선다(이름 사본 한 개는 화면에 서지 않는다)', () => {
    expect(seedColumns().map((c) => c.key)).toEqual([
      'partner',
      'partnerName',
      'partnerType',
      'bankCode',
      'accountNo',
      'accountHolder',
      'amount',
      'requestOn',
    ])
  })

  it('화면에 서는 일곱 열의 이름과 순서가 확정된 그대로다', () => {
    expect(visibleColumns(seedColumns()).map((c) => c.label)).toEqual([
      '거래처명',
      '구분',
      '은행',
      '계좌번호',
      '예금주',
      '송금액',
      '송금 요청일',
    ])
  })

  it('거래처를 고르는 칸은 참조이고 사본 다섯 칸은 그 참조를 가리킨다', () => {
    const byKey = new Map(seedColumns().map((c) => [c.key, c]))
    expect(byKey.get('partner')?.type).toBe('PARTNER_REF')
    expect(byKey.get('partner')?.source).toBeUndefined()
    for (const [key, field] of [
      ['partnerName', 'NAME'],
      ['partnerType', 'PARTNER_TYPE'],
      ['bankCode', 'BANK'],
      ['accountNo', 'ACCOUNT_NO'],
      ['accountHolder', 'ACCOUNT_HOLDER'],
    ] as const) {
      // 사본은 글자 칸이어야 한다 — 금액 칸에 붙으면 합계액 후보로 서서 예산이 그 자리에서 깎인다.
      expect(byKey.get(key)?.type).toBe('TEXT')
      expect(byKey.get(key)?.source).toEqual({ from: 'partner', field })
    }
  })

  it('사람이 적는 두 칸은 key를 그대로 둔다(임시저장한 문서의 값이 갈 곳을 잃지 않는다)', () => {
    const byKey = new Map(seedColumns().map((c) => [c.key, c]))
    expect(byKey.get('amount')?.type).toBe('MONEY')
    expect(byKey.get('requestOn')?.type).toBe('DATE')
    // 대표 금액을 달지 않는다 — 문서 금액은 지출 내역 표가 답한다(송금액은 그 돈의 분배다).
    expect(byKey.get('amount')?.primaryAmount).toBeUndefined()
  })

  it('화면 파서가 시드의 열을 그대로 읽는다(버리는 칸이 없다)', () => {
    const parsed = parseFields([
      { key: 'remittances', label: '송금 요청', type: 'TABLE', columns: seedColumns() },
    ])
    expect(parsed[0]?.columns?.map((c) => c.key)).toEqual(seedColumns().map((c) => c.key))
    expect(parsed[0]?.columns?.map((c) => c.source)).toEqual(seedColumns().map((c) => c.source))
  })
})
