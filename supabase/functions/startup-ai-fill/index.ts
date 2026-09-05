// [STARTUP AI 작성하기] 첨부 PDF → Gemini → 상세 카드 초안(JSON)
// 요청: { startupId, attachmentIds: string[], cards: CardKey[] }
// 응답: { cards, notes, evidence, model, elapsedMs } | 4xx/5xx
//
// 보안:
// - 인증된 **내부 사용자**만 호출한다. 게스트 커스텀 JWT는 받지 않는다(WORKS 전용 기능).
// - 대상 기업의 쓰기 자격을 서버가 다시 묻는다(public.can_write_startup — 정책과 한 벌).
//   UI 숨김은 보안이 아니고, 이 호출은 자료를 외부로 내보내는 행위다.
// - 첨부 메타는 **호출자 토큰**으로 조회해 RLS를 그대로 태운다. service_role은 스토리지
//   바이트를 읽는 데만 쓴다(material-download와 같은 규약).
// - attachmentIds가 그 기업에 귀속되지 않으면 전체 거부한다(부분 처리 없음).
// - 파일마다 access_logs를 적재하고, **적재에 실패하면 모델을 부르지 않는다**(기록 없는 반출 금지).
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
import { buildPrompt } from './prompts.ts'
import { buildResponseSchema } from './schema.ts'
import { normalizeEnvelope, parseJson } from './validate.ts'

const BUCKET = 'attachments'
/** 첨부 대상 다형 키(스타트업 자료는 한 곳에 모인다 — StartupDetailForm의 MATERIAL_TARGET_TYPE). */
const TARGET_TYPE = 'startup'

/** 인라인 합산 상한 14MB — base64 팽창(약 1.33배) 후에도 Gemini 20MB 요청 한도 안에 든다. */
const MAX_TOTAL_BYTES = 14 * 1024 * 1024
/** 한 번에 읽을 파일 수. 입력 토큰을 억제한다. */
const MAX_FILES = 5
/** 입력이 회의록 초안보다 크므로 상한 시간도 두 배로 둔다. */
const TIMEOUT_MS = 120_000

interface FillRequest {
  startupId?: string
  attachmentIds?: string[]
  cards?: string[]
}

/** ArrayBuffer를 base64로(청크 단위 — 대용량에서 call stack 초과 방지). */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** PDF만 받는다. Gemini가 네이티브로 읽는 문서 형식이고, 그 밖은 글자를 얻지 못한다. */
function isPdf(contentType: string | null, fileName: string): boolean {
  return contentType === 'application/pdf' || /\.pdf$/i.test(fileName)
}

/** 호출자 토큰을 그대로 실은 클라이언트 — 이 클라이언트의 조회에는 RLS가 끝까지 걸린다. */
function callerClient(token: string) {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
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

    // 3) 입력 검증 --------------------------------------------------------------
    const body = (await req.json().catch(() => ({}))) as FillRequest
    const startupId = String(body.startupId ?? '').trim()
    const attachmentIds = [...new Set((body.attachmentIds ?? []).map((v) => String(v).trim()).filter(Boolean))]
    const cards = (body.cards ?? []).filter(isCardKey) as CardKey[]
    if (!startupId || attachmentIds.length === 0 || cards.length === 0) {
      return jsonResponse({ error: 'invalid_request', message: '대상·자료·카드를 모두 선택해야 합니다.' }, 400)
    }
    if (attachmentIds.length > MAX_FILES) {
      return jsonResponse({ error: 'invalid_request', message: `자료는 한 번에 ${MAX_FILES}개까지 읽을 수 있습니다.` }, 400)
    }

    const asCaller = callerClient(token)

    // 4) 쓰기 자격 재판정 — 정책과 같은 식을 되묻는다(TypeScript로 복제하지 않는다) ----
    const { data: writable, error: gateErr } = await asCaller.rpc('can_write_startup', { p_id: startupId })
    if (gateErr) {
      console.error('[startup-ai-fill] 권한 판정 실패', gateErr.message)
      return jsonResponse({ error: 'internal_error' }, 500)
    }
    if (writable !== true) {
      return jsonResponse({ error: 'forbidden', message: '이 기업의 정보를 수정할 권한이 없습니다.' }, 403)
    }

    // 5) 첨부 메타: 호출자 토큰으로 조회해 RLS를 태우고, 그 기업 것만 남긴다 ----------
    const { data: atts, error: attErr } = await asCaller
      .from('attachments')
      .select('id, file_name, storage_path, content_type, byte_size')
      .in('id', attachmentIds)
      .eq('target_type', TARGET_TYPE)
      .eq('target_id', startupId)
      .is('deleted_at', null)
    if (attErr) return jsonResponse({ error: 'internal_error' }, 500)
    const files = atts ?? []
    // 하나라도 남의 것·없는 것이 섞이면 전체를 거부한다(부분 처리는 무엇을 읽었는지 흐린다).
    if (files.length !== attachmentIds.length) {
      return jsonResponse({ error: 'invalid_request', message: '선택한 자료를 찾을 수 없습니다.' }, 400)
    }
    const nonPdf = files.filter((f) => !isPdf(f.content_type as string | null, String(f.file_name)))
    if (nonPdf.length > 0) {
      return jsonResponse(
        { error: 'unsupported_type', message: 'PDF 자료만 읽을 수 있습니다. PDF로 변환해 올려 주세요.' },
        415,
      )
    }
    const totalBytes = files.reduce((sum, f) => sum + Number(f.byte_size ?? 0), 0)
    if (totalBytes > MAX_TOTAL_BYTES) {
      return jsonResponse({ error: 'too_large', message: '선택한 자료의 합이 너무 큽니다(14MB 이하).' }, 413)
    }

    // 6) 감사 로그 — 적재에 실패하면 모델을 부르지 않는다 ----------------------------
    const { error: logErr } = await admin.from('access_logs').insert(
      files.map((f) => ({
        user_id: appUserId,
        resource_type: 'attachment_ai_read',
        resource_id: f.id,
        reason: `AI 작성하기(외부 AI 전송): ${f.file_name}`,
      })),
    )
    if (logErr) {
      return jsonResponse({ error: 'log_failed', message: '자료 반출 기록을 남기지 못해 중단했습니다.' }, 500)
    }

    // 7) 대상 기업명(프롬프트 맥락) — 실패해도 진행한다(있으면 좋은 값이다) -----------
    const { data: startup } = await asCaller.from('startups').select('name').eq('id', startupId).maybeSingle()
    const companyName = startup?.name ? String(startup.name) : ''

    // 8) Gemini 호출 -------------------------------------------------------------
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const parts: unknown[] = []
      for (const f of files) {
        const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(String(f.storage_path))
        if (dlErr || !blob) {
          console.error('[startup-ai-fill] 스토리지 읽기 실패', f.id, dlErr?.message)
          return jsonResponse({ error: 'internal_error', message: '자료를 읽지 못했습니다.' }, 500)
        }
        parts.push({ inlineData: { mimeType: 'application/pdf', data: toBase64(await blob.arrayBuffer()) } })
      }
      parts.push({ text: buildPrompt(cards, companyName) })

      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`
      const payload = JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          // 사실을 옮기는 작업이라 온도를 낮게 둔다(같은 자료에서 같은 답이 나와야 한다).
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: buildResponseSchema(cards),
        },
      })

      // 파싱 실패만 1회 재시도한다. 모델 오류(5xx)는 같은 요청을 다시 보내도 같은 답이라 즉시 502.
      let envelope: ReturnType<typeof normalizeEnvelope> | null = null
      for (let attempt = 0; attempt < 2 && !envelope; attempt += 1) {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: payload,
        })
        if (!resp.ok) {
          const detail = await resp.text().catch(() => '')
          console.error('[startup-ai-fill] gemini 오류', resp.status, detail.slice(0, 500))
          return jsonResponse({ error: 'draft_failed', message: 'AI 작성에 실패했습니다.' }, 502)
        }
        const data = (await resp.json().catch(() => ({}))) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[]
        }
        const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
        const parsed = parseJson(text)
        if (parsed) envelope = normalizeEnvelope(parsed, cards)
        else console.error('[startup-ai-fill] 파싱 실패', attempt, text.slice(0, 500))
      }
      if (!envelope) {
        return jsonResponse({ error: 'draft_failed', message: 'AI 응답을 해석하지 못했습니다.' }, 502)
      }

      return jsonResponse({ ...envelope, model, elapsedMs: Date.now() - startedAt })
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError'
      return jsonResponse(
        {
          error: aborted ? 'timeout' : 'server_error',
          message: aborted
            ? '자료가 커서 시간이 초과됐습니다. 파일 수를 줄여 다시 시도하세요.'
            : 'AI 작성 중 오류가 발생했습니다.',
        },
        aborted ? 504 : 500,
      )
    } finally {
      clearTimeout(timer)
    }
  }),
)
