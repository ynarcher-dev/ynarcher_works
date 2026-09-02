import { supabase } from '@/lib/supabase'
import { GUEST_USER_TYPE_FILTER } from '@/lib/userTypes'

/**
 * 원장 목록 조회 공통 규약.
 *
 * STARTUP·FUND·사업 3종의 목록은 답해야 하는 것이 같다 — 살아 있는 행을 스코프로 좁히고,
 * 검색어·필터를 걸고, 한 컬럼으로 정렬해 한 페이지만 끊어 온다. 그런데 지금까지는 워크스페이스마다
 * 같은 절차를 각자 복제하고 있었고, 그래서 한쪽만 고쳐 어긋나기 쉬웠다(FUND는 아예 페이지네이션
 * 없이 전량을 내려받고 있었다). 절차를 여기 하나로 모으고, 원장마다 다른 것(테이블·표시 컬럼·
 * 검색 대상·필터 축)만 인자로 받는다.
 *
 * 조건을 스코프와 좁힘(narrow) 둘로 나누는 이유는 건수 두 개가 서로 다른 질문에 답하기 때문이다.
 * 스코프는 '이 목록이 무엇인가'(내 것인가/어느 구분인가)라 전체 건수에도 포함되고, 좁힘은
 * '지금 무엇을 찾고 있나'라 반영 건수에만 든다.
 *
 * 인덱스 규약: 여기서 만드는 쿼리 모양에 맞춰 원장마다 부분 인덱스가 깔려 있다
 * (20260731220000_list_search_sort_indexes.sql — 검색 trigram GIN + 정렬 btree, 둘 다
 * `liveColumns` 조건을 건 부분 인덱스). `liveColumns`나 `order`를 바꾸면 인덱스 조건과
 * 어긋나 조용히 순차 스캔으로 되돌아가므로 마이그레이션의 spec을 함께 고쳐야 한다.
 */

/** 어떤 행도 만족시키지 않는 id(필터 결과가 공집합일 때의 표식). */
export const NO_MATCH_ID = '00000000-0000-0000-0000-000000000000'

/** 목록 한 페이지. */
export interface LedgerPage<T> {
  rows: T[]
  /** 검색어·필터 반영 건수(페이지 수·No. 넘버링 기준). */
  total: number
  /** 스코프만 반영한 전체 건수(검색·필터 미적용). */
  totalAll: number
}

/**
 * 목록 조건 한 줄. PostgREST 빌더를 그대로 넘기지 않고 서술형으로 받는다 —
 * 빌더를 넘기면 스코프만 다시 거는 전체 건수 질의에서 같은 조건을 두 번 조립하게 되고,
 * 둘이 어긋나면 '반영 3건 / 전체 1건' 같은 앞뒤가 안 맞는 건수가 나온다.
 */
export type LedgerCondition =
  | { kind: 'eq'; column: string; value: string }
  | { kind: 'in'; column: string; values: readonly string[] }
  | { kind: 'gt'; column: string; value: string }
  | { kind: 'gte'; column: string; value: string }
  | { kind: 'lte'; column: string; value: string }
  /** PostgREST `.or()` 원문(배열 포함 검사처럼 위 종류로 표현되지 않는 조건). */
  | { kind: 'or'; expr: string }

/** 조건을 걸 수 있는 최소 형태. supabase 빌더의 제네릭이 복잡해 쓰는 메서드만 좁혀 받는다. */
interface Conditionable<Q> {
  eq(column: string, value: string): Q
  in(column: string, values: readonly string[]): Q
  gt(column: string, value: string): Q
  gte(column: string, value: string): Q
  lte(column: string, value: string): Q
  or(expr: string): Q
  is(column: string, value: null): Q
}

/** 조건 목록을 빌더에 차례로 건다. */
function applyConditions<Q extends Conditionable<Q>>(
  query: Q,
  conditions: readonly LedgerCondition[],
): Q {
  let q = query
  for (const c of conditions) {
    if (c.kind === 'eq') q = q.eq(c.column, c.value)
    else if (c.kind === 'in') q = q.in(c.column, c.values)
    else if (c.kind === 'gt') q = q.gt(c.column, c.value)
    else if (c.kind === 'gte') q = q.gte(c.column, c.value)
    else if (c.kind === 'lte') q = q.lte(c.column, c.value)
    else q = q.or(c.expr)
  }
  return q
}

/** 살아 있는 행 조건(soft delete·병합 컬럼을 전부 `is null`로). */
function applyLive<Q extends Conditionable<Q>>(query: Q, columns: readonly string[]): Q {
  let q = query
  for (const col of columns) q = q.is(col, null)
  return q
}

export interface LedgerPageSpec {
  /** 원장 테이블명. */
  table: string
  /** 표시 컬럼 + 임베드 select 문자열. */
  select: string
  /**
   * 살아 있는 행 판정 컬럼. 병합을 쓰는 원장은 `merged_into_id`까지 함께 넘긴다.
   * 인덱스 부분 조건과 일치해야 한다.
   */
  liveColumns: readonly string[]
  order: { column: string; ascending: boolean; nullsFirst?: boolean }
  page: number
  pageSize: number
  /** '이 목록이 무엇인가'. 전체 건수에도 반영된다. */
  scope?: readonly LedgerCondition[]
  /** '지금 무엇을 찾고 있나'(검색어·필터). 반영 건수에만 든다. */
  narrow?: readonly LedgerCondition[]
}

/**
 * 목록 한 페이지 + 건수 두 개를 조회한다.
 * 좁힘 조건이 하나도 없으면 반영 건수가 곧 전체 건수이므로 두 번째 질의를 내지 않는다.
 */
export async function fetchLedgerPage<T>(spec: LedgerPageSpec): Promise<LedgerPage<T>> {
  const { table, select, liveColumns, order, page, pageSize } = spec
  const scope = spec.scope ?? []
  const narrow = spec.narrow ?? []
  const from = page * pageSize

  let q = supabase.from(table).select(select, { count: 'exact' })
  q = applyLive(q, liveColumns)
  q = applyConditions(q, scope)
  q = applyConditions(q, narrow)
  const { data, error, count } = await q
    .order(order.column, { ascending: order.ascending, nullsFirst: order.nullsFirst })
    .range(from, from + pageSize - 1)
  if (error) throw error
  const total = count ?? 0

  if (narrow.length === 0) {
    return { rows: (data ?? []) as unknown as T[], total, totalAll: total }
  }

  const allCount = await countLedgerRows({ table, liveColumns, conditions: scope })
  return { rows: (data ?? []) as unknown as T[], total, totalAll: allCount }
}

export interface LedgerCountSpec {
  table: string
  liveColumns: readonly string[]
  /** 셀 조건(스코프 + 좁힘을 구분하지 않는다 — 건수 하나만 답한다). */
  conditions?: readonly LedgerCondition[]
}

/**
 * 조건에 걸리는 살아 있는 행의 개수만 세어 온다(행은 내려받지 않는다).
 * 목록의 전체 건수와, 상태별로 쪼개 세는 집계(진행 현황 파이프라인)가 같은 절차를 공유해야
 * 건수가 어긋나지 않는다 — 그래서 `fetchLedgerPage`도 이 함수를 경유한다.
 */
export async function countLedgerRows(spec: LedgerCountSpec): Promise<number> {
  let q = supabase.from(spec.table).select('id', { count: 'exact', head: true })
  q = applyLive(q, spec.liveColumns)
  q = applyConditions(q, spec.conditions ?? [])
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

/**
 * PostgREST `.or()` 값에서 문법 제어문자(콤마·괄호)를 제거해 필터 파싱이 깨지지 않게 한다.
 * 원장 검색어는 사실상 콤마·괄호를 담지 않으므로 유실 영향은 없다.
 */
export function sanitizeOrValue(v: string): string {
  return v.replace(/[(),]/g, ' ').trim()
}

/**
 * 이름으로 사용자 id를 역조회한다. 담당자·생성자를 이름으로 검색하는 경로는 원장마다 있고,
 * 사람 이름은 원장에 없으므로(참조만 있다) 어느 목록이든 이 한 번의 조회를 거친다.
 * `users.name`에는 부분일치 인덱스가 있다(20260731220000).
 *
 * 게스트 계정은 제외한다 — 담당자·생성자는 내부 임직원만 될 수 있으므로 게스트 id를 섞어
 * 돌려주면 검색 결과에 아무 레코드도 걸리지 않는 id가 조건에 들어갈 뿐이다.
 */
export async function userIdsByName(keyword: string): Promise<string[]> {
  const { data } = await supabase
    .from('users')
    .select('id')
    .ilike('name', `%${keyword}%`)
    .not('user_type', 'in', GUEST_USER_TYPE_FILTER)
  return ((data ?? []) as { id: string }[]).map((u) => u.id)
}

/**
 * 담당자 원장에서 내가 맡은 레코드 id를 모은다.
 * 담당은 원장 밖(별도 다대다 테이블)에 있어 조인 조건으로 한 번에 걸 수 없다.
 */
export async function managedRecordIds(
  managerTable: string,
  recordColumn: string,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase.from(managerTable).select(recordColumn).eq('user_id', userId)
  const rows = (data ?? []) as unknown as Record<string, string | null>[]
  const ids = rows.map((r) => r[recordColumn]).filter((v): v is string => Boolean(v))
  return [...new Set(ids)]
}
