// 게스트 맥락의 본체 원장 3종(programs / ma_programs / funds)을 읽는 단일 창구.
//
// 2026-09-03에 모듈·명부·게스트향 원장은 한 벌로 통합되었지만 **본체는 갈린 채로 남았다**.
// 대상 자체의 속성이 워크스페이스마다 다르고, 내용물이 본체를 직접 FK로 물지 않아 갈라져 있어도
// 막히는 것이 없기 때문이다. 그래서 "id 하나로 한 줄을 읽는" 일만 여기 모은다.
//
// 2026-09-09에 조합(`funds`)이 세 번째 원장으로 들어왔다. **조합은 사업이 아니지만 게스트가
// 들어오는 문의 모양은 같다** — 참여 줄(program_participants)·개요·공지·Q&A가 통합 원장이고,
// 갈리는 것은 본체의 칸 이름과 '죽은 상태'의 값뿐이다. 그 둘을 아래 `LEDGER_META` 한 곳에
// 모으고, 부르는 쪽은 원장을 몰라도 같은 이름(`title`·`status`)으로 읽는다.
//
// 원장을 차례로 두드리는 이유: 게스트 경로가 손에 쥔 것은 id뿐이고(세션 클레임·명부 행),
// 그 id가 어느 원장에 있는지는 저장돼 있지 않다. 호출은 로그인·갱신처럼 드문 지점에서만 일어나며,
// 첫 원장에서 찾으면 한 번으로 끝난다. entity_key를 손에 쥔 호출부는 programTable()로 곧장 간다.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** 다형 키 → 본체 원장 이름. 여기 없는 키는 해석이 성립하지 않는다. */
export const PROGRAM_LEDGERS = {
  program: 'programs',
  ma_program: 'ma_programs',
  fund: 'funds',
} as const

export type ProgramEntityKey = keyof typeof PROGRAM_LEDGERS

/**
 * 원장마다 갈리는 것 둘 — **제목이 사는 칸**과 **게스트가 못 들어가는 상태**.
 *
 * 제목은 PostgREST 별칭(`title:name`)으로 흡수한다. 부르는 쪽이 원장별 컬럼 이름을 알게 되면
 * 그 이름이 조회 조립·응답 형태·화면까지 번져 원장을 하나 더 여는 일이 그 전부를 고치는 일이 된다.
 *
 * 죽은 상태의 값을 한 집합으로 뭉치지 않는 이유는 **뜻이 다르기 때문**이다. 사업은 종료·취소이고
 * 조합은 해산(CLOSED) 하나다 — 청산 중(LIQUIDATING)은 아직 살아 있고 그 구간에도 회수·정산
 * 안내가 오간다. 뭉치면 청산 중 조합의 문이 닫히거나 반대로 해산한 조합이 열린 채로 남는다.
 * DB의 `app.guest_program_ids()`가 같은 규칙을 갖고 있으며, 두 곳이 같은 답을 말해야
 * "목록에는 뜨는데 들어가면 빈 화면"이 생기지 않는다.
 */
export interface LedgerMeta {
  /** 제목이 실제로 사는 칸. 별칭으로 `title`에 맞춘다. */
  titleColumn: string
  /** 시작·종료일이 사는 칸. 조합은 존속기간이다. */
  startColumn: string
  endColumn: string
  /** 주관 기관. 조합에는 없다(null이면 조회에서 빠지고 응답에도 서지 않는다). */
  hostColumn: string | null
  /** 게스트가 진입할 수 없는 상태값. */
  deadStatuses: readonly string[]
}

export const LEDGER_META: Record<string, LedgerMeta> = {
  programs: {
    titleColumn: 'title',
    startColumn: 'start_date',
    endColumn: 'end_date',
    hostColumn: 'host_organization',
    deadStatuses: ['FINISHED', 'CANCELLED'],
  },
  ma_programs: {
    titleColumn: 'title',
    startColumn: 'start_date',
    endColumn: 'end_date',
    hostColumn: 'host_organization',
    deadStatuses: ['FINISHED', 'CANCELLED'],
  },
  funds: {
    titleColumn: 'name',
    startColumn: 'term_start',
    endColumn: 'term_end',
    hostColumn: null,
    deadStatuses: ['CLOSED'],
  },
}

/** 원장 이름 순회 순서. PROJECT가 가장 많으므로 먼저 둔다. */
const TABLES = Object.values(PROGRAM_LEDGERS)

/** 다형 키 → 원장 이름. 모르는 키는 null(조용히 PROJECT로 해석하지 않는다). */
export function programTable(entityKey: string): string | null {
  return PROGRAM_LEDGERS[entityKey as ProgramEntityKey] ?? null
}

/** 원장 이름 → 다형 키. 원장을 찾아 읽은 쪽이 그 사실을 화면에 넘길 때 쓴다. */
export function ledgerEntityKey(table: string): ProgramEntityKey | null {
  const hit = Object.entries(PROGRAM_LEDGERS).find(([, t]) => t === table)
  return (hit?.[0] as ProgramEntityKey) ?? null
}

/** `select=` 한 칸. 실제 컬럼과 이름이 다르면 별칭을 단다(`title:name`). */
function aliased(alias: string, column: string): string {
  return alias === column ? alias : `${alias}:${column}`
}

/** 이 원장에서 그 상태가 '들어갈 수 없음'인가. 모르는 원장은 막는다(모르는 것을 열지 않는다). */
export function isDeadProgram(table: string, status: string | null): boolean {
  const meta = LEDGER_META[table]
  if (!meta) return true
  return status != null && meta.deadStatuses.includes(status)
}

/**
 * 맥락 고르기 목록이 읽는 칸(코드·제목·상태·기간). 원장이 셋이라 별칭으로 이름을 맞춘다.
 */
export function contextSelect(table: string): string {
  const meta = LEDGER_META[table] ?? LEDGER_META.programs
  return `id, code, ${aliased('title', meta.titleColumn)}, status, deleted_at, guest_access_ends_at`
}

/**
 * 게스트 화면이 읽는 칸. **주관 기관이 없는 원장에서는 그 칸이 아예 서지 않는다** —
 * 없는 컬럼을 별칭으로 부르면 조회 전체가 거절되고, 빈 값으로 채우면 화면이 '주관 미정'이라는
 * 있지도 않은 사실을 말한다.
 */
export function guestProgramSelect(table: string): string {
  const meta = LEDGER_META[table] ?? LEDGER_META.programs
  const cols = [
    'id',
    aliased('title', meta.titleColumn),
    'code',
    'status',
    aliased('start_date', meta.startColumn),
    aliased('end_date', meta.endColumn),
    'deleted_at',
  ]
  if (meta.hostColumn) cols.push(aliased('host_organization', meta.hostColumn))
  return cols.join(', ')
}

/**
 * id로 한 줄을 읽는다. 어느 원장에 있는지 모를 때 쓰며, 없으면 null이다.
 *
 * `columns`는 문자열 하나가 아니라 **원장 이름을 받아 조립하는 함수**다 — 칸 이름이 원장마다
 * 다르므로 부르는 쪽이 문자열 하나를 넘기면 그 하나가 반드시 어느 원장에서는 틀린다.
 * 어느 원장에서 찾았는지도 함께 돌려준다(죽은 상태 판정이 원장별이라 필요하다).
 */
export async function loadProgramAnywhere<T = Record<string, unknown>>(
  db: SupabaseClient,
  programId: string,
  columns: (table: string) => string,
): Promise<{ row: T; table: string } | null> {
  for (const table of TABLES) {
    const { data } = await db.from(table).select(columns(table)).eq('id', programId).maybeSingle()
    if (data) return { row: data as T, table }
  }
  return null
}

/**
 * id 여러 건의 제목을 한 번에 읽는다(안내 발송의 이름 표기용).
 * 어느 원장에 몇 건이 있는지 모르므로 세 원장을 모두 훑어 합친다.
 */
export async function loadProgramTitles(
  db: SupabaseClient,
  programIds: string[],
): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  if (programIds.length === 0) return titles
  for (const table of TABLES) {
    const meta = LEDGER_META[table]
    const { data } = await db
      .from(table)
      .select(`id, ${aliased('title', meta.titleColumn)}`)
      .in('id', programIds)
    // select 문자열을 원장별로 조립하므로 PostgREST의 정적 추론이 서지 않는다(문자열 리터럴이
    // 아니라 값이다). 형태는 바로 위에서 우리가 정했으므로 unknown을 거쳐 좁힌다.
    for (const p of (data ?? []) as unknown as { id: string; title: string }[]) {
      titles.set(p.id, p.title)
    }
  }
  return titles
}
