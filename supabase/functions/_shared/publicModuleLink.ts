// 모듈 공개 링크(/p/:token)의 해석·게이트 단일 기준.
//
// 공개 경로의 판정을 한 파일에 모은 이유는, 여는 함수(public-module-get)와 파일을 내주는
// 함수(public-module-file)가 **같은 답**을 해야 하기 때문이다. 판정을 두 벌로 두면 링크를
// 닫은 뒤에도 파일만 계속 나가는 날이 온다.
//
// 판정 순서는 좁은 것부터가 아니라 **바깥부터** 간다 — 토큰 → 링크 상태·기간 → 모듈 생존 →
// 사업 생존. 안쪽에서 먼저 걸리면 열람자에게 돌려줄 사유가 실제 원인과 어긋난다.
//
// 근거 기획: docs/docs_planning/3_4_15_ac_public_links.md §6.3, §6.4, §8
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** 열 수 없는 사유. null이면 공개 가능. */
export type LinkDenyReason =
  | 'not_found' // 그런 주소가 없다(토큰 오류)
  | 'private' // 주소는 있으나 아직 열지 않았다
  | 'closed' // 담당자가 마감했거나 기간이 지났다
  | 'scheduled' // 아직 열릴 때가 안 됐다
  | 'module_closed' // 메뉴가 꺼졌거나 취소됐다(사업 종료 포함)

/**
 * 사업 3종의 원장 이름표. 모듈 원장이 물리적으로 분리되어 있으므로 다형 키에서 접두사를 얻는다.
 * 여기 없는 키는 해석 자체가 성립하지 않는다(링크 원장 CHECK가 이미 막지만, 공개 경로는
 * 스스로 한 번 더 확인한다 — 이 함수는 인증 없는 입구다).
 */
const LEDGERS = {
  program: { prefix: '', programs: 'programs' },
  ma_program: { prefix: 'ma_', programs: 'ma_programs' },
  project_program: { prefix: 'project_', programs: 'project_programs' },
} as const

export type EntityKey = keyof typeof LEDGERS

export interface ResolvedLink {
  linkId: string
  entityKey: EntityKey
  moduleId: string
  programId: string
  moduleType: string
  moduleTitle: string | null
  programTitle: string
  /** 모듈 세팅의 기간·메모(공개 화면의 기간·설명이 여기서 나온다). */
  settings: Record<string, unknown>
  contact: string | null
  /** 상속을 적용한 실제 공개 기간(화면 문구가 날짜를 말할 때 쓴다). */
  openAt: string | null
  closeAt: string | null
  tables: { modules: string; posts: string; links: string }
}

/**
 * 'YYYY-MM-DD'를 KST 하루의 시작/끝으로 읽는다.
 *
 * 모듈 기간은 시각이 없는 날짜라 그대로 Date로 넘기면 UTC 자정으로 해석되어, 한국에서
 * 마감일 당일 오전 9시부터 이미 닫힌다. 이 서비스의 날짜는 전부 KST 기준이므로 오프셋을
 * 명시해 읽는다. 마감일은 **그날이 끝날 때까지** 열려 있어야 한다(사람은 마감일을 포함으로 읽는다).
 */
function kstDay(date: string, edge: 'start' | 'end'): string {
  return edge === 'start' ? `${date}T00:00:00+09:00` : `${date}T23:59:59.999+09:00`
}

function readDate(settings: Record<string, unknown>, key: string): string | null {
  const v = settings?.[key]
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

/**
 * 토큰 하나로 링크·모듈·사업을 한 번에 푼다. service_role 클라이언트를 받으므로 RLS가 걸리지
 * 않는다 — 노출 판정은 전적으로 아래 게이트가 하며, 그래서 이 함수는 반환 필드를 스스로 좁힌다.
 */
export async function resolvePublicLink(
  db: SupabaseClient,
  token: string,
  now: number = Date.now(),
): Promise<{ reason: LinkDenyReason; openAt?: string | null; closeAt?: string | null } | { reason: null; link: ResolvedLink }> {
  const { data: link } = await db
    .from('program_module_public_links')
    .select('id, entity_key, program_module_id, status, open_at, close_at, contact')
    .eq('token', token)
    .maybeSingle()
  if (!link) return { reason: 'not_found' }

  const ledger = LEDGERS[link.entity_key as EntityKey]
  if (!ledger) return { reason: 'not_found' }
  const tables = {
    modules: `${ledger.prefix}program_modules`,
    posts: `${ledger.prefix}program_posts`,
    links: `${ledger.prefix}program_links`,
  }

  const { data: mod } = await db
    .from(tables.modules)
    .select('id, program_id, module_type, title, enabled, status, settings')
    .eq('id', link.program_module_id)
    .maybeSingle()
  // 고아 링크(모듈이 지워짐)는 닫힌 것으로 답한다 — 주소가 틀린 것이 아니라 메뉴가 없어진 것이다.
  if (!mod) return { reason: 'module_closed' }

  const settings = (mod.settings ?? {}) as Record<string, unknown>
  const inheritedStart = readDate(settings, 'start_date')
  const inheritedEnd = readDate(settings, 'end_date')
  // 링크에 기간을 적지 않았으면 모듈 기간을 그대로 쓴다 — 같은 사실을 두 번 받으면
  // 어긋났을 때 어느 쪽이 진짜인지 판정할 근거가 없다.
  const openAt = link.open_at ?? (inheritedStart ? kstDay(inheritedStart, 'start') : null)
  const closeAt = link.close_at ?? (inheritedEnd ? kstDay(inheritedEnd, 'end') : null)

  // (1) 링크 상태·기간
  if (link.status === 'PRIVATE') return { reason: 'private', openAt, closeAt }
  if (link.status !== 'OPEN') return { reason: 'closed', openAt, closeAt }
  if (openAt && now < new Date(openAt).getTime()) return { reason: 'scheduled', openAt, closeAt }
  if (closeAt && now > new Date(closeAt).getTime()) return { reason: 'closed', openAt, closeAt }

  // (2) 모듈 생존. 준비(DRAFT) 단계도 닫는다 — 메뉴가 서는 것과 그 안이 열리는 것은 다른
  //     물음이고, 담당자가 아직 준비로 둔 자료가 바깥에 먼저 나가서는 안 된다.
  if (!mod.enabled) return { reason: 'module_closed', openAt, closeAt }
  if (mod.status !== 'OPEN' && mod.status !== 'CLOSED') return { reason: 'module_closed', openAt, closeAt }

  // (3) 사업 생존 — 종료·취소·삭제된 사업의 문은 함께 닫힌다.
  const { data: program } = await db
    .from(ledger.programs)
    .select('id, title, status, deleted_at')
    .eq('id', mod.program_id)
    .maybeSingle()
  if (!program || program.deleted_at) return { reason: 'module_closed', openAt, closeAt }
  if (program.status === 'FINISHED' || program.status === 'CANCELLED') {
    return { reason: 'module_closed', openAt, closeAt }
  }

  return {
    reason: null,
    link: {
      linkId: link.id as string,
      entityKey: link.entity_key as EntityKey,
      moduleId: mod.id as string,
      programId: mod.program_id as string,
      moduleType: mod.module_type as string,
      moduleTitle: (mod.title as string | null) ?? null,
      programTitle: program.title as string,
      settings,
      contact: (link.contact as string | null) ?? null,
      openAt,
      closeAt,
      tables,
    },
  }
}

/** 거부 사유 → HTTP 상태. 주소가 틀린 것과 닫힌 것은 다른 사실이라 코드도 가른다. */
export function denyStatus(reason: LinkDenyReason): number {
  return reason === 'not_found' ? 404 : 403
}
