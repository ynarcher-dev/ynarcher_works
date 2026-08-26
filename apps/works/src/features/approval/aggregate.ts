import {
  columnSum,
  scalarValue,
  tableRows,
  toNumber,
  type FieldValues,
  type FormField,
} from '@/features/approval/fields'

/**
 * 양식별 금액 집계 — "수기로 옮겨 적던 일"을 대신하는 계층.
 *
 * 지출결의서의 지출 내역처럼 표(TABLE) 필드에 담긴 행을 문서 경계 너머로 펴서, 항목별로
 * 합산한다. 값이 타입을 갖기 때문에 가능한 일이다 — HTML 한 덩어리였다면 여기서 할 수 있는
 * 것이 아무 것도 없다.
 *
 * 순수 계층(React·DB 의존 없음).
 */

/** 집계 대상 문서 한 건(스키마+값). */
export interface AggregateDoc {
  id: string
  title: string
  docNo: string | null
  createdAt: string
  departmentId: string | null
  amount: number | null
  fields: FormField[]
  values: FieldValues
}

/** 집계 한 줄 — 무엇으로 묶었는가(항목)와 얼마인가(합계·건수). */
export interface AggregateRow {
  key: string
  label: string
  total: number
  count: number
}

/** 집계를 무엇으로 묶을지. */
export type GroupBy = 'item' | 'document' | 'month'

/**
 * 표 필드에서 "이름 열"을 고른다 — 대표 금액 열이 아닌 첫 텍스트·선택 열.
 * 금액 옆에 적힌 그 이름이 곧 사람이 집계할 때 쓰는 항목명이다.
 */
function labelColumnKey(field: FormField): string | null {
  const col = (field.columns ?? []).find(
    (c) => !c.primaryAmount && (c.type === 'TEXT' || c.type === 'SELECT'),
  )
  return col?.key ?? null
}

/** 대표 금액이 걸린 표 필드와 그 금액 열. 없으면 null. */
export function primaryTable(
  fields: FormField[],
): { field: FormField; amountKey: string } | null {
  for (const f of fields) {
    if (f.type !== 'TABLE') continue
    const col = (f.columns ?? []).find((c) => c.primaryAmount)
    if (col) return { field: f, amountKey: col.key }
  }
  return null
}

/** 문서 한 건의 금액 — 저장된 amount(DB가 파생)를 우선하고, 없으면 값에서 계산한다. */
export function docAmount(doc: AggregateDoc): number {
  if (doc.amount !== null) return doc.amount
  const table = primaryTable(doc.fields)
  if (table) return columnSum(tableRows(doc.values, table.field.key), table.amountKey)
  for (const f of doc.fields) {
    if ((f.type === 'MONEY' || f.type === 'NUMBER') && f.primaryAmount) {
      return toNumber(scalarValue(doc.values, f.key)) ?? 0
    }
  }
  return 0
}

/**
 * 항목별 집계 — 표의 행을 문서 너머로 펴서 이름이 같은 항목끼리 더한다.
 * 표가 없는 양식(금액이 스칼라)은 문서 자체가 한 항목이 된다.
 */
function byItem(docs: AggregateDoc[]): AggregateRow[] {
  const map = new Map<string, AggregateRow>()
  for (const doc of docs) {
    const table = primaryTable(doc.fields)
    if (!table) {
      const amount = docAmount(doc)
      if (amount === 0) continue
      upsert(map, '(항목 없음)', '(항목 없음)', amount)
      continue
    }
    const labelKey = labelColumnKey(table.field)
    for (const row of tableRows(doc.values, table.field.key)) {
      const amount = toNumber(row[table.amountKey] ?? '')
      if (amount === null) continue
      const label = (labelKey ? row[labelKey] : '')?.trim() || '(이름 없음)'
      upsert(map, label, label, amount)
    }
  }
  return sorted(map)
}

function byDocument(docs: AggregateDoc[]): AggregateRow[] {
  return docs
    .map((doc) => ({
      key: doc.id,
      label: doc.docNo ? `${doc.docNo} ${doc.title}` : doc.title,
      total: docAmount(doc),
      count: 1,
    }))
    .sort((a, b) => b.total - a.total)
}

function byMonth(docs: AggregateDoc[]): AggregateRow[] {
  const map = new Map<string, AggregateRow>()
  for (const doc of docs) {
    const month = doc.createdAt.slice(0, 7)
    upsert(map, month, month, docAmount(doc))
  }
  // 달은 크기순이 아니라 시간순으로 읽는다.
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
}

function upsert(map: Map<string, AggregateRow>, key: string, label: string, amount: number) {
  const prev = map.get(key)
  if (prev) {
    prev.total += amount
    prev.count += 1
  } else {
    map.set(key, { key, label, total: amount, count: 1 })
  }
}

function sorted(map: Map<string, AggregateRow>): AggregateRow[] {
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export function aggregate(docs: AggregateDoc[], groupBy: GroupBy): AggregateRow[] {
  if (groupBy === 'document') return byDocument(docs)
  if (groupBy === 'month') return byMonth(docs)
  return byItem(docs)
}

export function totalOf(rows: AggregateRow[]): number {
  return rows.reduce((sum, r) => sum + r.total, 0)
}

/** 기간 필터(YYYY-MM-DD 경계, 비어 있으면 무제한). 기안일 기준. */
export function inPeriod(createdAt: string, from: string, to: string): boolean {
  const day = createdAt.slice(0, 10)
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}
