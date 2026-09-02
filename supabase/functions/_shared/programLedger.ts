// 사업 본체 원장 3종(programs / ma_programs / project_programs)을 읽는 단일 창구.
//
// 2026-09-03에 모듈·명부·게스트향 원장은 한 벌로 통합되었지만 **사업 본체는 갈린 채로 남았다**.
// 사업 자체의 속성이 워크스페이스마다 다르고, 내용물이 사업을 직접 FK로 물지 않아 갈라져 있어도
// 막히는 것이 없기 때문이다. 그래서 "사업 id 하나로 사업 한 줄을 읽는" 일만 여기 모은다.
//
// 세 원장을 차례로 두드리는 이유: 게스트 경로가 손에 쥔 것은 사업 id뿐이고(세션 클레임·명부 행),
// 그 id가 어느 원장에 있는지는 저장돼 있지 않다. 호출은 로그인·갱신처럼 드문 지점에서만 일어나며,
// 첫 원장에서 찾으면 한 번으로 끝난다. entity_key를 손에 쥔 호출부는 programTable()로 곧장 간다.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** 다형 키 → 사업 본체 원장 이름. 여기 없는 키는 해석이 성립하지 않는다. */
export const PROGRAM_LEDGERS = {
  program: 'programs',
  ma_program: 'ma_programs',
  project_program: 'project_programs',
} as const

export type ProgramEntityKey = keyof typeof PROGRAM_LEDGERS

/** 원장 이름 순회 순서. AC가 가장 많으므로 먼저 둔다. */
const TABLES = Object.values(PROGRAM_LEDGERS)

/** 다형 키 → 원장 이름. 모르는 키는 null(조용히 AC로 해석하지 않는다). */
export function programTable(entityKey: string): string | null {
  return PROGRAM_LEDGERS[entityKey as ProgramEntityKey] ?? null
}

/**
 * 사업 id로 사업 한 줄을 읽는다. 어느 원장에 있는지 모를 때 쓰며, 없으면 null이다.
 * 세 원장의 컬럼명이 같으므로 호출부는 원장을 몰라도 같은 `columns`를 쓴다.
 */
export async function loadProgramAnywhere<T = Record<string, unknown>>(
  db: SupabaseClient,
  programId: string,
  columns: string,
): Promise<T | null> {
  for (const table of TABLES) {
    const { data } = await db.from(table).select(columns).eq('id', programId).maybeSingle()
    if (data) return data as T
  }
  return null
}

/**
 * 사업 id 여러 건의 제목을 한 번에 읽는다(안내 발송의 사업명 표기용).
 * 어느 원장에 몇 건이 있는지 모르므로 세 원장을 모두 훑어 합친다.
 */
export async function loadProgramTitles(
  db: SupabaseClient,
  programIds: string[],
): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  if (programIds.length === 0) return titles
  for (const table of TABLES) {
    const { data } = await db.from(table).select('id, title').in('id', programIds)
    for (const p of (data ?? []) as { id: string; title: string }[]) {
      titles.set(p.id, p.title)
    }
  }
  return titles
}
