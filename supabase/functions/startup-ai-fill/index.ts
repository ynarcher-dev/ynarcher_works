// [STARTUP AI 작성하기] 첨부 자료 → Gemini → 상세 카드 초안(JSON)
// 요청(수정 모드, JSON): { startupId, attachmentIds: string[], cards: CardKey[], assignments }
// 요청(등록 모드, multipart): cards=<JSON 배열>, assignments=<JSON 객체>, files=<파일 여러 개>,
//                             fileKeys=<JSON 배열, files와 같은 순서>, links=<주소 여러 개>
// 응답: { cards, notes, evidence, skippedSources, failedCards, model, modelVersion, elapsedMs }
//       | 4xx/5xx
//
// **담당자는 한 번 누르고 서버가 나눠 부른다(2026-09-06).** `assignments`는 카드마다 읽을
// 자료를 지정한 격자이고, 서버는 먼저 자료 조합이 같은 카드를 모은 뒤 카드가 많을 때만 탐색
// 축으로 나눠 병렬로 보낸다. 소수 카드 때문에 같은 큰 문서를 여러 번 읽히지 않는다.
// 나누는 목적은 둘이다 — 카드가 쓰지 않을 자료가 빠져 잡음이 줄고(재무 카드에 IR 자료가 함께
// 들어가면 확정 재무 대신 목표 매출을 집어 온다), 요청당 출력이 작아져 답이 잘리지 않는다.
// 자료는 조합이 몇 벌이든 **한 번 내려받아 한 번 올리고** 요청들이 그 주소를 함께 쓴다.
// 한 요청이 실패해도 나머지 카드는 그대로 돌려주고 실패한 카드만 `failedCards`가 말한다.
//
// 보안:
// - 인증된 **내부 사용자**만 호출한다. 게스트 커스텀 JWT는 받지 않는다(WORKS 전용 기능).
// - 쓰기 자격을 서버가 다시 묻는다. 묻는 대상이 모드마다 다르다 —
//     · 수정: public.can_write_startup(id)  = "이 기업을 고칠 수 있는가"
//     · 등록: public.can_create_startup()   = "스타트업을 만들 수 있는가"(가리킬 행이 아직 없다)
//   두 판정식 모두 정책에서 꺼낸 것이라 여기에 복제본이 없다.
// - 첨부 메타는 **호출자 토큰**으로 조회해 RLS를 그대로 태운다. service_role은 스토리지
//   바이트를 읽는 데와 감사 로그 적재에만 쓴다(material-download와 같은 규약).
// - attachmentIds가 그 기업에 귀속되지 않으면 전체 거부한다(부분 처리 없음).
// - 파일마다 access_logs를 적재하고, **적재에 실패하면 모델을 부르지 않는다**(기록 없는 반출 금지).
// - 등록 모드로 올라온 파일은 **우리 쪽 어디에도 저장하지 않는다**(초안만 만들고 버린다).
// - 자료가 커서 Files API로 올렸다면 **끝나며 반드시 지운다**(성공·실패·예외 모두). 구글의
//   48시간 자동 삭제에 기대지 않는다 — 기밀 자료를 필요한 시간보다 오래 남길 이유가 없다.
// - GEMINI_API_KEY는 서버 시크릿으로만 접근하며 클라이언트로 노출하지 않는다.
// - DB에 쓰지 않는다(감사 로그 제외). 저장은 화면의 통상 저장 경로(RLS)가 담당한다.
// 주의: 사업계획서는 기업의 기밀 자료이므로 Gemini(외부 AI)로 전송된다는 점이 전제되어 있다
//       (모달에서 매번 동의를 받는다). ALLOWED_ORIGINS로 호출 origin을 제한할 것.
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md,
//       docs/docs_dev/11_migration_security_gate.md,
//       supabase/functions/material-download/index.ts(첨부 RLS 조회·감사 로그 패턴)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { isCardKey, type CardKey } from './cards.ts'
import { deleteFile, type UploadedFile } from './filesApi.ts'
import { planGroups, type Assignments } from './groups.ts'
import { ASSEMBLY_BUDGET_MS, GROUP_CONCURRENCY, TIMEOUT_MS } from './limits.ts'
import { readLink } from './linkRead.ts'
import { dedupe, mergeEnvelopes } from './merge.ts'
import { buildParts, selectParts } from './parts.ts'
import { runPool } from './pool.ts'
import { generateDraft } from './generate.ts'
import { buildPrompt } from './prompts.ts'
import {
  resolveAttachments,
  resolvePendingLinks,
  resolveUploads,
  validateSources,
  type AttachmentRow,
  type ResolvedSource,
} from './sources.ts'
import { parseJson, type Envelope } from './validate.ts'

const BUCKET = 'attachments'
/** 첨부 대상 다형 키(스타트업 자료는 한 곳에 모인다 — StartupDetailForm의 MATERIAL_TARGET_TYPE). */
const TARGET_TYPE = 'startup'

/** 실패한 요청이 맡고 있던 카드. 화면이 "무엇을 못 썼는지"를 이 목록으로 말한다. */
interface FailedCards {
  keys: CardKey[]
  /** 담당자에게 그대로 보이는 사유. 구글의 원문 오류·자료 내용은 담기지 않는다. */
  message: string
  /** 구글이 준 상태 코드(있으면). 운영이 원인을 가르는 데만 쓴다. */
  upstream: number | null
}

/** 호출자 토큰을 그대로 실은 클라이언트 — 이 클라이언트의 조회에는 RLS가 끝까지 걸린다. */
function callerClient(token: string) {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

/** 요청에서 카드 키 목록을 읽는다. 알 수 없는 값은 버린다(클라이언트를 그대로 믿지 않는다). */
function readCards(raw: unknown): CardKey[] {
  const list = Array.isArray(raw) ? raw : []
  return list.filter(isCardKey) as CardKey[]
}

/**
 * 카드별 자료 배정(격자)을 읽는다.
 *
 * **객체가 아예 오지 않았을 때만 null이고, 그때는 모든 카드가 자료 전부를 읽는다** — 격자
 * 이전의 화면이 보낸 요청도 그대로 돌아야 하고, 그때의 동작이 한 요청이었다.
 *
 * 객체가 왔는데 쓸 수 있는 줄이 하나도 없으면 **빈 배정**을 돌려준다(null이 아니다). 둘을
 * 가르지 않으면 "격자를 보냈는데 전부 걸러진" 요청이 "격자를 안 보낸" 요청과 같아져, 아무것도
 * 고르지 않았는데 자료 전부를 읽는 일이 된다. 빈 배정은 묶음 0개가 되어 400으로 막힌다.
 */
function readAssignments(raw: unknown): Assignments | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Assignments = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isCardKey(key) || !Array.isArray(value)) continue
    out[key] = value.map((v) => String(v)).filter(Boolean)
  }
  return out
}

/**
 * 동시에 보낼 요청 수.
 *
 * 값은 코드가 갖되 **시크릿으로 내릴 수 있게** 둔다. 요율 티어가 낮은 키에서는 셋도 몰림으로
 * 읽히는데, 그것은 배포 없이 고쳐야 하는 종류의 문제다. 올리는 쪽은 막는다 — 넷을 넘겨서
 * 얻는 시간보다 429로 잃는 시간이 크다.
 */
function readConcurrency(): number {
  const raw = Number(Deno.env.get('GEMINI_MAX_CONCURRENCY'))
  if (!Number.isFinite(raw) || raw < 1) return GROUP_CONCURRENCY
  return Math.min(Math.trunc(raw), 4)
}

Deno.serve(
  withCors(async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)
    const startedAt = Date.now()

    // 1) 호출자 인증(내부 사용자 전용) -------------------------------------------
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return jsonResponse({ error: 'unauthorized' }, 401)
    const admin = supabaseAdmin()
    const { data: authData, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !authData.user) return jsonResponse({ error: 'unauthorized' }, 401)
    const { data: me } = await admin
      .from('users')
      .select('id')
      .eq('auth_user_id', authData.user.id)
      .is('deleted_at', null)
      .maybeSingle()
    const appUserId = (me?.id as string | undefined) ?? null
    if (!appUserId) return jsonResponse({ error: 'unauthorized' }, 401)

    // 2) 서버 시크릿 ------------------------------------------------------------
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      return jsonResponse({ error: 'not_configured', message: 'AI 작성 키가 설정되지 않았습니다.' }, 503)
    }
    // 별칭 모델을 기본값으로 둔다(특정 버전은 신규 프로젝트에 폐기될 수 있어 GEMINI_MODEL로 덮어쓴다).
    const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest'

    const asCaller = callerClient(token)
    const isUpload = (req.headers.get('content-type') ?? '').includes('multipart/form-data')

    let cards: CardKey[] = []
    let sources: ResolvedSource[] = []
    let companyName = ''
    let startupId: string | null = null
    /** 카드별 자료 배정. null이면 모든 카드가 자료 전부를 읽는다(옛 화면 호환). */
    let assignments: Assignments | null = null

    if (isUpload) {
      // 3-a) 등록 모드: 아직 원장에 없는 파일이 요청에 실려 온다 -------------------
      const form = await req.formData().catch(() => null)
      if (!form) return jsonResponse({ error: 'invalid_request', message: '요청 형식이 올바르지 않습니다.' }, 400)
      cards = readCards(parseJson(String(form.get('cards') ?? '[]')))
      assignments = readAssignments(parseJson(String(form.get('assignments') ?? 'null')))
      companyName = String(form.get('companyName') ?? '').trim()
      const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
      // 화면이 만든 파일 키를 files와 같은 순서로 받는다. 순번을 서버가 다시 세면 담당자가
      // 자료를 골라 보낼 때 화면의 키와 어긋나 배정이 엉뚱한 자료를 가리킨다.
      const fileKeys = (parseJson(String(form.get('fileKeys') ?? '[]')) as unknown[] | null) ?? []
      const pendingLinks = form
        .getAll('links')
        .map((v) => String(v).trim())
        .filter((v) => /^https?:\/\//i.test(v))

      // 가리킬 행이 없으므로 "만들 수 있는가"를 묻는다.
      const { data: creatable, error: gateErr } = await asCaller.rpc('can_create_startup')
      if (gateErr) {
        console.error('[startup-ai-fill] 등록 권한 판정 실패', gateErr.message)
        return jsonResponse({ error: 'internal_error' }, 500)
      }
      if (creatable !== true) {
        return jsonResponse({ error: 'forbidden', message: '스타트업을 등록할 권한이 없습니다.' }, 403)
      }

      const resolved = await resolveUploads(files, fileKeys.map((k) => String(k)))
      if ('error' in resolved) {
        return jsonResponse({ error: resolved.error.code, message: resolved.error.message }, resolved.error.status)
      }
      sources = [...resolved.sources, ...resolvePendingLinks(pendingLinks)]
    } else {
      // 3-b) 수정 모드: 이미 올라간 첨부를 id로 가리킨다 --------------------------
      const body = (await req.json().catch(() => ({}))) as {
        startupId?: string
        attachmentIds?: string[]
        cards?: unknown
        assignments?: unknown
      }
      startupId = String(body.startupId ?? '').trim() || null
      cards = readCards(body.cards)
      assignments = readAssignments(body.assignments)
      const ids = [...new Set((body.attachmentIds ?? []).map((v) => String(v).trim()).filter(Boolean))]
      if (!startupId || ids.length === 0) {
        return jsonResponse({ error: 'invalid_request', message: '대상과 자료를 모두 선택해야 합니다.' }, 400)
      }

      const { data: writable, error: gateErr } = await asCaller.rpc('can_write_startup', { p_id: startupId })
      if (gateErr) {
        console.error('[startup-ai-fill] 권한 판정 실패', gateErr.message)
        return jsonResponse({ error: 'internal_error' }, 500)
      }
      if (writable !== true) {
        return jsonResponse({ error: 'forbidden', message: '이 기업의 정보를 수정할 권한이 없습니다.' }, 403)
      }

      // 첨부 메타는 호출자 토큰으로 — RLS가 그 행을 볼 자격을 판정한다.
      const { data: atts, error: attErr } = await asCaller
        .from('attachments')
        .select('id, file_name, kind, url, storage_path, content_type, byte_size')
        .in('id', ids)
        .eq('target_type', TARGET_TYPE)
        .eq('target_id', startupId)
        .is('deleted_at', null)
      if (attErr) return jsonResponse({ error: 'internal_error' }, 500)
      const resolved = resolveAttachments((atts ?? []) as AttachmentRow[], ids)
      if ('error' in resolved) {
        return jsonResponse({ error: resolved.error.code, message: resolved.error.message }, resolved.error.status)
      }
      sources = resolved.sources

      const { data: startup } = await asCaller.from('startups').select('name').eq('id', startupId).maybeSingle()
      companyName = startup?.name ? String(startup.name) : ''
    }

    if (cards.length === 0) {
      return jsonResponse({ error: 'invalid_request', message: '작성할 카드를 선택해야 합니다.' }, 400)
    }
    // 예비 검사 — 적혀 있는 크기로 먼저 끊는다(큰 파일을 내려받기 전에 막기 위해).
    const sizeError = validateSources(sources)
    if (sizeError) return jsonResponse({ error: sizeError.code, message: sizeError.message }, sizeError.status)

    // 4-0) 묶음을 여기서 정한다 — **감사 로그보다 먼저**여야 한다.
    // 반출 기록은 "실제로 밖으로 나간 자료"를 적는 것이라, 어느 카드에도 배정되지 않아 모델에
    // 닿지 않을 자료까지 적으면 그 기록이 사실이 아니게 된다. 겸해서 그런 자료는 내려받지도
    // 않는다(스토리지 왕복과 자료 모으기 시간을 그만큼 아낀다).
    const groups = planGroups(cards, assignments, sources.map((s) => s.key))
    if (groups.length === 0) {
      return jsonResponse(
        { error: 'invalid_request', message: '카드마다 읽을 자료를 하나 이상 지정해야 합니다.' },
        400,
      )
    }
    const usedKeys = new Set(groups.flatMap((g) => g.sourceKeys))
    sources = sources.filter((s) => usedKeys.has(s.key))

    // 4) 감사 로그 — 적재에 실패하면 모델을 부르지 않는다 ----------------------------
    // 등록 모드는 가리킬 행이 없어 resource_id가 비고, 무엇을 보냈는지는 파일명이 답한다.
    const { error: logErr } = await admin.from('access_logs').insert(
      sources.map((s) => ({
        user_id: appUserId,
        resource_type: s.attachmentId ? 'attachment_ai_read' : 'startup_draft_ai_read',
        resource_id: s.attachmentId,
        reason: `AI 작성하기(외부 AI 전송): ${s.name}`,
      })),
    )
    if (logErr) {
      return jsonResponse({ error: 'log_failed', message: '자료 반출 기록을 남기지 못해 중단했습니다.' }, 500)
    }

    // 5) 자료 조립 + Gemini 호출 ---------------------------------------------------
    // 올린 자료는 어느 경로로 끝나든 지워야 하므로 지우는 쪽이 목록을 쥔다. 조립이 돌려주는
    // 값에 실으면 업로드 도중 시간이 초과돼 예외로 빠져나갈 때 목록이 함께 사라진다.
    const uploaded: UploadedFile[] = []
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const built = await buildParts(
        sources,
        {
          apiKey,
          signal: controller.signal,
          download: async (path) => {
            const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(path)
            if (dlErr || !blob) {
              console.error('[startup-ai-fill] 스토리지 읽기 실패', path, dlErr?.message)
              return null
            }
            return await blob.arrayBuffer()
          },
          readLink,
          // 모아 오는 일은 여기까지. 남은 시간은 모델이 쓴다.
          deadline: Date.now() + ASSEMBLY_BUDGET_MS,
          // 요청이 둘 이상이면 인라인을 쓰지 않는다(요청마다 base64 사본이 생긴다).
          forceFilesApi: groups.length > 1,
        },
        uploaded,
      )
      if ('error' in built) {
        return jsonResponse({ error: built.error.code, message: built.error.message }, built.error.status)
      }
      const notices = dedupe(built.notices)

      // 읽을 것이 하나도 남지 않으면 모델을 부르지 않는다(빈 초안에 비용을 쓰지 않는다).
      if (built.fileParts.size === 0 && built.textParts.size === 0) {
        return jsonResponse(
          { error: 'no_readable_source', message: `읽을 수 있는 자료가 없습니다. ${notices.join(' / ')}` },
          400,
        )
      }

      // 소재지 선택지는 ADMIN 원장이 소유한다. 상수로 적어 두면 원장에서 시·도가 바뀌는 날
      // 서버만 옛 목록으로 판정하므로, 그 카드를 고른 요청에서만 그때그때 받아 온다.
      let locations: string[] = []
      if (cards.includes('basics')) {
        const { data: tags } = await asCaller
          .from('location_tags')
          .select('name')
          .is('deleted_at', null)
          .order('sort_order')
        locations = (tags ?? []).map((t) => String(t.name)).filter(Boolean)
      }

      // 5-2) 묶음마다 조각을 고른다. 지정한 자료를 하나도 못 읽은 묶음은 부르지 않는다 —
      // 근거 없이 부르면 모델이 지어낼 자리만 생기고, 담당자에게는 "못 찾았다"로 보여
      // 자료를 못 읽었다는 사실이 묻힌다.
      const failedCards: FailedCards[] = []
      const runnable = groups.flatMap((group) => {
        const parts = selectParts(built, group.sourceKeys)
        if (parts.length === 0) {
          failedCards.push({
            keys: group.cards,
            message: '지정한 자료를 읽지 못해 건너뛰었습니다.',
            upstream: null,
          })
          return []
        }
        return [{ group, parts }]
      })
      if (runnable.length === 0) {
        return jsonResponse(
          { error: 'no_readable_source', message: `읽을 수 있는 자료가 없습니다. ${notices.join(' / ')}` },
          400,
        )
      }

      // 5-3) 병렬 호출. 한 묶음의 실패가 다른 묶음의 결과를 버리지 않는다.
      const settled = await runPool(runnable, readConcurrency(), ({ group, parts }, i) =>
        generateDraft({
          apiKey,
          model,
          parts: [...parts, { text: buildPrompt(group.cards, companyName, locations) }],
          cards: group.cards,
          signal: controller.signal,
          normalize: { locations },
          label: `${i + 1}/${runnable.length}`,
        }),
      )

      // 5-4) 성공한 것만 합치고 실패한 카드는 이름으로 말한다.
      const envelopes: Envelope[] = []
      let modelVersion: string | null = null
      let abortedGroups = 0
      for (const [i, r] of settled.entries()) {
        const group = runnable[i].group
        if (r.status === 'rejected') {
          const aborted = r.reason instanceof DOMException && r.reason.name === 'AbortError'
          if (aborted) abortedGroups += 1
          else console.error('[startup-ai-fill] 묶음 예외', r.reason instanceof Error ? r.reason.message : r.reason)
          failedCards.push({
            keys: group.cards,
            message: aborted
              ? '시간이 초과돼 이 카드는 작성하지 못했습니다.'
              : 'AI 작성 중 오류가 발생했습니다.',
            upstream: null,
          })
          continue
        }
        if ('failure' in r.value) {
          failedCards.push({
            keys: group.cards,
            message: r.value.failure.message,
            upstream: r.value.failure.upstream,
          })
          continue
        }
        envelopes.push(r.value.envelope)
        // 별칭이 실제로 어느 모델이었는지. 묶음마다 같은 값이라 먼저 온 것을 쓴다.
        modelVersion ??= r.value.telemetry.modelVersion
      }

      console.log(
        '[startup-ai-fill] 실행 요약',
        JSON.stringify({
          groups: groups.length,
          called: runnable.length,
          ok: envelopes.length,
          failed: failedCards.length,
          sources: sources.length,
          uploaded: uploaded.length,
          elapsedMs: Date.now() - startedAt,
        }),
      )

      // 전부 실패했을 때만 오류다. 하나라도 성공하면 그 카드는 담당자의 손에 들어가야 한다.
      if (envelopes.length === 0) {
        const allAborted = abortedGroups === settled.length
        return jsonResponse(
          {
            error: allAborted ? 'timeout' : 'draft_failed',
            message: allAborted
              ? '대용량 문서 분석이 지연되어 시간이 초과됐습니다. 잠시 후 다시 시도하세요.'
              : (failedCards[0]?.message ?? 'AI 작성에 실패했습니다.'),
            // 못 읽은 자료도 함께 보낸다 — 실패한 이유가 그것일 수 있다.
            skippedSources: notices,
            failedCards,
          },
          allAborted ? 504 : 502,
        )
      }

      return jsonResponse({
        ...mergeEnvelopes(envelopes),
        // 못 읽었거나 일부만 읽은 자료는 결과와 같은 자리에서 알린다 — 화면이 이 줄을 안내에 그대로 세운다.
        skippedSources: notices,
        // 부분 성공. 빈 배열이면 전부 성공이며, 화면은 이 목록으로 "무엇을 못 썼는지"를 말한다.
        failedCards,
        model,
        // 별칭이 아니라 실제로 답한 모델. 운영이 품질 변화를 이 값으로 가른다.
        modelVersion,
        elapsedMs: Date.now() - startedAt,
      })
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError'
      return jsonResponse(
        {
          error: aborted ? 'timeout' : 'server_error',
          message: aborted
            ? '대용량 문서 분석이 지연되어 시간이 초과됐습니다. 잠시 후 다시 시도하세요.'
            : 'AI 작성 중 오류가 발생했습니다.',
        },
        aborted ? 504 : 500,
      )
    } finally {
      clearTimeout(timer)
      // 올린 자료는 성공·실패·예외를 가리지 않고 지운다.
      await Promise.all(uploaded.map((f) => deleteFile(apiKey, f)))
    }
  }),
)
