// [AI 작성하기] 요청을 읽어 "무엇을 읽고 무엇을 채울지"까지 세운다 — 자격을 묻는 것도 여기다.
//
// 진입점에서 뗀 이유는 두 모드가 **자격을 묻는 대상부터 다르기** 때문이다. 수정은 가리킬 행이
// 있어 "이 레코드를 고칠 수 있는가"를 묻고, 등록은 행이 아직 없어 "이 대상을 만들 수 있는가"를
// 묻는다. 두 판정이 진입점 한복판에 섞여 있으면 어느 경로가 어느 문을 지나는지가 흐려진다.
//
// 판정식 자체는 여기에 없다. 프로파일이 정책에서 꺼낸 함수를 되묻고(`canWrite`/`canCreate`)
// 이 파일은 그 답만 본다 — 판정식을 TypeScript로 옮기면 그 복제본이 곧 권한 구멍이 된다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8.1·§8.2·§16.16

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { ExtractChunk } from '../docParse/types.ts'
import { parseJson } from './envelope.ts'
import { extractsFromRows, readPendingExtracts, type ExtractRow } from './extractsIn.ts'
import type { Assignments } from './groups.ts'
import type { AiFillProfile, CallerClient } from './profile.ts'
import { loadRefAttachments } from './refs.ts'
import { readAssignments, readCards } from './request.ts'
import {
  resolveAttachments,
  resolvePendingLinks,
  resolveUploads,
  type AttachmentRow,
  type ResolvedSource,
} from './sources.ts'

/** 담당자에게 그대로 보이는 거절. */
export interface IntakeError {
  code: string
  message?: string
  status: number
}

/** 요청을 다 읽고 난 뒤의 상태 — 이 뒤로는 모드의 차이가 없다. */
export interface Intake<K extends string> {
  cards: K[]
  sources: ResolvedSource[]
  assignments: Assignments | null
  /** 자료 키 → 이미 분석된 조각. 비어 있으면 종전처럼 원본을 그 자리에서 읽는다. */
  extracts: Map<string, ExtractChunk[]>
  /** 프롬프트에 실을 대상의 이름. */
  subject: string
  /** 수정 모드의 대상 id. 등록 모드는 null. */
  targetId: string | null
}

export interface IntakeDeps<K extends string, C> {
  profile: AiFillProfile<K, C>
  /** 호출자 토큰을 실은 클라이언트. **이 클라이언트의 조회에는 RLS가 끝까지 걸린다.** */
  caller: SupabaseClient
  /** 카드 키 판정. 클라이언트가 보낸 값을 그대로 믿지 않는다. */
  isCardKey: (v: unknown) => v is K
}

/**
 * 등록 모드 — 아직 원장에 없는 파일·링크가 요청에 실려 온다.
 *
 * 가리킬 행이 없으므로 첨부 조회도 캐시 조회도 없다. 이미 분석된 자료는 화면이 결과를 들고
 * 있다가 함께 싣고, 서버는 그 값을 되세워 쓴다(저장하지 않는다 — 등록을 취소하면 고아 파일이
 * 남지 않아야 한다).
 */
async function readUpload<K extends string, C>(
  req: Request,
  deps: IntakeDeps<K, C>,
): Promise<Intake<K> | { error: IntakeError }> {
  const form = await req.formData().catch(() => null)
  if (!form) return { error: { code: 'invalid_request', message: '요청 형식이 올바르지 않습니다.', status: 400 } }

  const cards = readCards(parseJson(String(form.get('cards') ?? '[]')), deps.isCardKey)
  const assignments = readAssignments(parseJson(String(form.get('assignments') ?? 'null')), deps.isCardKey)
  const subject = String(form.get('subjectName') ?? form.get('companyName') ?? '').trim()
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  // 화면이 만든 파일 키를 files와 같은 순서로 받는다. 순번을 서버가 다시 세면 담당자가
  // 자료를 골라 보낼 때 화면의 키와 어긋나 배정이 엉뚱한 자료를 가리킨다.
  const fileKeys = (parseJson(String(form.get('fileKeys') ?? '[]')) as unknown[] | null) ?? []
  const pendingLinks = form
    .getAll('links')
    .map((v) => String(v).trim())
    .filter((v) => /^https?:\/\//i.test(v))

  // 가리킬 행이 없으므로 "만들 수 있는가"를 묻는다.
  if (!(await deps.profile.canCreate(deps.caller as unknown as CallerClient))) {
    return { error: { code: 'forbidden', message: deps.profile.messages.forbiddenCreate, status: 403 } }
  }

  const resolved = await resolveUploads(files, fileKeys.map((k) => String(k)))
  if ('error' in resolved) return { error: resolved.error }
  const sources = [...resolved.sources, ...resolvePendingLinks(pendingLinks)]

  // 이미 분석된 보류 자료는 파일이 아니라 **조각으로** 실려 온다. 가리킬 원본이 없으므로
  // 자리만 만들어 준다 — 그래야 배정·감사 기록이 그 자료를 보고, 조각을 고를 수 있다.
  const extracts = new Map<string, ExtractChunk[]>()
  for (const [key, entry] of readPendingExtracts(parseJson(String(form.get('extracts') ?? 'null')))) {
    extracts.set(key, entry.chunks)
    if (sources.some((s) => s.key === key)) continue
    sources.push({
      key,
      attachmentId: null,
      name: entry.name,
      byteSize: 0,
      storagePath: null,
      data: null,
      mime: null,
      url: null,
    })
  }

  return { cards, sources, assignments, extracts, subject, targetId: null }
}

/** 수정 모드 — 이미 올라간 첨부를 id로 가리킨다. */
async function readStored<K extends string, C>(
  req: Request,
  deps: IntakeDeps<K, C>,
): Promise<Intake<K> | { error: IntakeError }> {
  const body = (await req.json().catch(() => ({}))) as {
    targetId?: string
    attachmentIds?: string[]
    cards?: unknown
    assignments?: unknown
    [key: string]: unknown
  }
  // 대상 id의 이름은 `targetId`다. 프로파일이 옛 이름을 밝히면 그것도 받는다 — 함수를 먼저
  // 배포하고 화면을 뒤에 내보내는 순서라, 그 사이 이미 떠 있는 화면이 옛 이름으로 부른다.
  const legacy = deps.profile.legacyIdKey ? body[deps.profile.legacyIdKey] : undefined
  const targetId = String(body.targetId ?? legacy ?? '').trim() || null
  const cards = readCards(body.cards, deps.isCardKey)
  const assignments = readAssignments(body.assignments, deps.isCardKey)
  const ids = [...new Set((body.attachmentIds ?? []).map((v) => String(v).trim()).filter(Boolean))]
  if (!targetId || ids.length === 0) {
    return { error: { code: 'invalid_request', message: '대상과 자료를 모두 선택해야 합니다.', status: 400 } }
  }

  if (!(await deps.profile.canWrite(deps.caller as unknown as CallerClient, targetId))) {
    return { error: { code: 'forbidden', message: deps.profile.messages.forbiddenWrite, status: 403 } }
  }

  // 첨부 메타는 호출자 토큰으로 — RLS가 그 행을 볼 자격을 판정한다.
  const { data: atts, error: attErr } = await deps.caller
    .from('attachments')
    .select('id, file_name, kind, url, storage_path, content_type, byte_size')
    .in('id', ids)
    .eq('target_type', deps.profile.targetType)
    .eq('target_id', targetId)
    .is('deleted_at', null)
  if (attErr) return { error: { code: 'internal_error', status: 500 } }

  // 이 레코드의 것이 아닌 id는 **참조 자료**일 수 있다(2026-09-08) — 연결한 스타트업 쪽에
  // 올라간 자료를 셀러 퀵 리뷰가 그대로 읽는 경우다. 참조를 먼저 묻지 않고 **남은 id가 있을
  // 때만** 묻는 것이 요점이다: 참조가 없는 대상(대부분)에서 왕복 한 번이 늘지 않고, 무엇을
  // 참조로 찾는지가 코드에서 그대로 읽힌다.
  //
  // 어느 대상의 자료를 함께 읽는지는 여기서 판정하지 않는다 — RPC가 호출자 토큰으로 돌며
  // 그쪽 원장의 SELECT 정책이 그대로 답한다(refs.ts).
  const own = (atts ?? []) as AttachmentRow[]
  const missing = ids.filter((id) => !own.some((r) => r.id === id))
  const fromRefs =
    missing.length === 0
      ? []
      : (await loadRefAttachments(deps.caller, deps.profile.targetType, targetId)).filter((r) =>
          missing.includes(r.id),
        )

  const resolved = resolveAttachments([...own, ...fromRefs], ids)
  if ('error' in resolved) return { error: resolved.error }

  // 이미 분석된 자료의 조각을 캐시에서 읽는다. **호출자 토큰으로** 읽는 이유는 그 표의
  // SELECT 정책이 첨부의 SELECT에 위임돼 있어서다 — 원본을 볼 수 있는 사람만 그 글자를
  // 본다는 규칙이 여기서도 그대로 걸린다.
  const { data: cached } = await deps.caller
    .from('attachment_extracts')
    .select('attachment_id, status, body')
    .in('attachment_id', ids)

  return {
    cards,
    sources: resolved.sources,
    assignments,
    extracts: extractsFromRows((cached ?? []) as ExtractRow[]),
    subject: await deps.profile.subjectName(deps.caller as unknown as CallerClient, targetId),
    targetId,
  }
}

/**
 * 요청의 모양이 모드를 정한다.
 *
 * multipart이면 등록 모드다 — 아직 원장에 없는 것(보류 파일·보류 링크)은 id로 말할 수 없어
 * 파일 자체가 실려 오기 때문이다. 두 모드를 섞어 받지 않는 이유는 자격을 묻는 대상이 다르기
 * 때문이고, 그 판정이 갈리는 자리가 곧 이 갈림길이다.
 */
export function readIntake<K extends string, C>(
  req: Request,
  deps: IntakeDeps<K, C>,
): Promise<Intake<K> | { error: IntakeError }> {
  const isUpload = (req.headers.get('content-type') ?? '').includes('multipart/form-data')
  return isUpload ? readUpload(req, deps) : readStored(req, deps)
}
