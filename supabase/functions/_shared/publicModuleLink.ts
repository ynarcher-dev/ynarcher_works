// 모듈 공개 링크(/p/:token)의 해석 — 토큰 하나로 링크·모듈·사업을 푼다.
//
// 판정 자체는 여기 두지 않고 publicModuleLinkGate.ts(순수)가 소유한다. 조회와 판정을 갈라 둔
// 이유는 이 판정이 틀리면 가장 크게 다치는 자리이기 때문이다 — 한쪽으로 틀리면 닫은 문이 열려
// 있고, 반대로 틀리면 열어 둔 문이 담당자 몰래 닫힌다. DB를 물고 있으면 단위 테스트가 되지 않아
// 그 위험이 배포 뒤에야 드러난다.
//
// 해석을 한 파일에 모은 이유는, 여는 함수(public-module-get)와 파일을 내주는 함수
// (public-module-file)가 **같은 답**을 해야 하기 때문이다. 판정을 두 벌로 두면 링크를 닫은
// 뒤에도 파일만 계속 나가는 날이 온다.
//
// 근거 기획: docs/docs_planning/3_4_15_ac_public_links.md §6.3, §6.4
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { gate, type LinkDenyReason } from './publicModuleLinkGate.ts'

export { denyStatus } from './publicModuleLinkGate.ts'
export type { LinkDenyReason } from './publicModuleLinkGate.ts'

/**
 * 다형 키 → 사업 원장 이름표. 모듈·글·링크 원장은 2026-09-03에 한 벌로 통합되어 키와
 * 무관하고, 갈리는 것은 사업 본체 원장뿐이다.
 *
 * 그래도 키를 여기서 한 번 더 확인한다 — 링크 원장 CHECK가 이미 막지만 이 함수는 인증 없는
 * 입구이고, 모르는 키가 들어왔을 때 '조용히 AC로 해석'하는 것이 최악의 실패 방식이다.
 */
const LEDGERS = {
  program: 'programs',
  ma_program: 'ma_programs',
  project_program: 'project_programs',
} as const

/** 세 워크스페이스가 공유하는 통합 원장. 소속은 테이블 이름이 아니라 entity_key가 답한다. */
const SHARED = { modules: 'program_modules', posts: 'program_posts', links: 'program_links' } as const

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
  /** 상속을 적용한 실제 공개 기간. */
  openAt: string | null
  closeAt: string | null
  tables: { modules: string; posts: string; links: string }
}

type ResolveResult =
  | { reason: LinkDenyReason; openAt?: string | null; closeAt?: string | null }
  | { reason: null; link: ResolvedLink }

function readDate(settings: Record<string, unknown>, key: string): string | null {
  const v = settings?.[key]
  return typeof v === 'string' ? v : null
}

/**
 * 토큰 하나로 링크·모듈·사업을 한 번에 푼다. service_role 클라이언트를 받으므로 RLS가 걸리지
 * 않는다 — 노출 판정은 전적으로 gate()가 하며, 그래서 이 함수는 반환 필드를 스스로 좁힌다.
 */
export async function resolvePublicLink(
  db: SupabaseClient,
  token: string,
  now: number = Date.now(),
): Promise<ResolveResult> {
  const { data: link } = await db
    .from('program_module_public_links')
    .select('id, entity_key, program_module_id, status, open_at, close_at, contact')
    .eq('token', token)
    .maybeSingle()
  if (!link) return { reason: 'not_found' }

  const programsTable = LEDGERS[link.entity_key as EntityKey]
  if (!programsTable) return { reason: 'not_found' }
  const tables = { ...SHARED }

  // entity_key를 조건에 함께 건다. id만으로 찾으면 다른 워크스페이스의 모듈을 자기 키로
  // 가리키는 링크가 통과하고, 그 순간 사업 생존 판정이 엉뚱한 원장을 보게 된다.
  const { data: mod } = await db
    .from(tables.modules)
    .select('id, program_id, module_type, title, enabled, status, settings')
    .eq('id', link.program_module_id)
    .eq('entity_key', link.entity_key)
    .maybeSingle()

  // 사업 조회는 모듈이 있을 때만 의미가 있다. 없으면 gate가 moduleExists=false로 닫는다.
  let programAlive = false
  let programTitle = ''
  if (mod) {
    const { data: program } = await db
      .from(programsTable)
      .select('id, title, status, deleted_at')
      .eq('id', mod.program_id)
      .maybeSingle()
    programAlive = Boolean(
      program && !program.deleted_at && program.status !== 'FINISHED' && program.status !== 'CANCELLED',
    )
    programTitle = (program?.title as string | undefined) ?? ''
  }

  // 템플릿 상한. ADMIN이 이 종류를 닫아 두면 개별 스위치와 무관하게 닫힌다(3_2_1 §6.4).
  // 행이 없으면 닫힌 것으로 본다 — 카탈로그에 없는 종류를 밖으로 내보낼 근거가 없다.
  let templateAllowsLink = false
  if (mod) {
    const { data: tpl } = await db
      .from('module_templates')
      .select('allow_public_link, is_active')
      .eq('key', mod.module_type)
      .maybeSingle()
    templateAllowsLink = Boolean(tpl?.is_active && tpl?.allow_public_link)
  }

  const settings = ((mod?.settings ?? {}) as Record<string, unknown>) ?? {}
  const verdict = gate(
    {
      linkStatus: link.status as string,
      linkOpenAt: (link.open_at as string | null) ?? null,
      linkCloseAt: (link.close_at as string | null) ?? null,
      moduleStartDate: readDate(settings, 'start_date'),
      moduleEndDate: readDate(settings, 'end_date'),
      moduleExists: Boolean(mod),
      moduleEnabled: Boolean(mod?.enabled),
      moduleStatus: (mod?.status as string | undefined) ?? '',
      programAlive,
      templateAllowsLink,
    },
    now,
  )
  if (verdict.reason) {
    return { reason: verdict.reason, openAt: verdict.openAt, closeAt: verdict.closeAt }
  }

  return {
    reason: null,
    link: {
      linkId: link.id as string,
      entityKey: link.entity_key as EntityKey,
      moduleId: mod!.id as string,
      programId: mod!.program_id as string,
      moduleType: mod!.module_type as string,
      moduleTitle: (mod!.title as string | null) ?? null,
      programTitle,
      settings,
      contact: (link.contact as string | null) ?? null,
      openAt: verdict.openAt,
      closeAt: verdict.closeAt,
      tables,
    },
  }
}
