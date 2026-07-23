// [회의록 AI 초안] 음성 전사 텍스트 + 회의 메타 → Gemini 회의록 초안 생성
// 요청: { transcript, title?, meetingDate?, attendees?: string[], agenda? }
// 응답: { title, agenda, body } — body는 TipTap 호환 HTML | 4xx/5xx
//
// 보안:
// - 인증된 내부 사용자만 호출 가능(세션 토큰 검증). UI 숨김 ≠ 보안.
// - DB를 건드리지 않는다(초안 텍스트만 반환). 저장은 상위 회의록 저장 폼이 담당.
// - 전사 텍스트 길이 상한(모델 낭비·비용 방지)을 서버에서 강제한다.
// - GEMINI_API_KEY는 서버 시크릿으로만 접근하며 클라이언트로 노출하지 않는다.
// 주의: 회의 내용은 기밀 콘텐츠이므로 Gemini(외부 AI)로 전송된다는 점이 전제되어 있다
//       (사용자가 Gemini 경로를 명시적으로 선택). ALLOWED_ORIGINS로 호출 origin을 제한할 것.
// 근거: docs/docs_dev/11_migration_security_gate.md,
//       supabase/functions/link-metadata/index.ts(인증 검증 패턴)
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

/** 전사 텍스트 상한(문자). 초과분은 잘라 보낸다(장시간 회의 방어). */
const MAX_TRANSCRIPT = 60_000

interface DraftRequest {
  transcript?: string
  title?: string
  meetingDate?: string
  attendees?: string[]
  agenda?: string
}

/** 모델이 코드펜스로 감싼 JSON을 돌려주는 경우까지 관대하게 파싱한다. */
function parseDraft(raw: string): { title: string; agenda: string; body: string } | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    const obj = JSON.parse(cleaned) as Record<string, unknown>
    return {
      title: String(obj.title ?? '').trim(),
      agenda: String(obj.agenda ?? '').trim(),
      body: String(obj.body ?? '').trim(),
    }
  } catch {
    return null
  }
}

function buildPrompt(req: DraftRequest, transcript: string): string {
  const meta: string[] = []
  if (req.title) meta.push(`기존 제목: ${req.title}`)
  if (req.meetingDate) meta.push(`회의일: ${req.meetingDate}`)
  if (req.attendees?.length) meta.push(`참석자: ${req.attendees.join(', ')}`)
  if (req.agenda) meta.push(`기존 안건: ${req.agenda}`)
  const metaBlock = meta.length ? `회의 메타데이터:\n${meta.join('\n')}\n\n` : ''

  return (
    '당신은 한국어 회의록 작성 보조자입니다. 아래는 회의 음성을 그대로 전사한 텍스트입니다. ' +
    '이를 바탕으로 격식 있고 간결한 회의록 초안을 작성하세요.\n\n' +
    '규칙:\n' +
    '- 전사에 없는 사실을 지어내지 마세요. 불명확한 부분은 생략합니다.\n' +
    '- 반드시 아래 JSON 형식 하나만 출력하세요. 코드펜스·설명 문장을 덧붙이지 마세요.\n' +
    '- title: 회의 성격을 요약한 20자 내외 제목(기존 제목이 적절하면 유지).\n' +
    '- agenda: 핵심 안건 한 줄(30자 내외).\n' +
    '- body: 회의록 본문을 HTML로. 허용 태그는 <h2>,<h3>,<p>,<ul>,<li>,<ol>,<strong>만. ' +
    '"논의 내용", "결정 사항", "후속 조치(담당·기한)" 소제목(<h3>)으로 구조화하세요.\n\n' +
    '{"title": "...", "agenda": "...", "body": "<h3>논의 내용</h3><ul><li>...</li></ul>..."}\n\n' +
    metaBlock +
    `전사 텍스트:\n${transcript}`
  )
}

Deno.serve(
  withCors(async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

    // 1) 호출자 인증(내부 사용자) ------------------------------------------------
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return jsonResponse({ error: 'unauthorized' }, 401)
    const { data: authData, error: authErr } = await supabaseAdmin().auth.getUser(token)
    if (authErr || !authData.user) return jsonResponse({ error: 'unauthorized' }, 401)

    // 2) 서버 시크릿 확인 --------------------------------------------------------
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) return jsonResponse({ error: 'not_configured', message: 'AI 초안 키가 설정되지 않았습니다.' }, 503)
    // 별칭 모델을 기본값으로 둔다(특정 버전은 신규 프로젝트에 폐기될 수 있어 GEMINI_MODEL로 덮어쓴다).
    const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest'

    // 3) 입력 검증 ---------------------------------------------------------------
    const body = (await req.json().catch(() => ({}))) as DraftRequest
    const transcript = String(body.transcript ?? '').trim().slice(0, MAX_TRANSCRIPT)
    if (transcript.length < 10) {
      return jsonResponse({ error: 'invalid_request', message: '초안을 만들 전사 내용이 부족합니다.' }, 400)
    }

    // 4) Gemini 호출(60초 타임아웃) ---------------------------------------------
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60_000)
    try {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(body, transcript) }] }],
          generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
        }),
      })
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '')
        console.error('[ai-minute-draft] gemini 오류', resp.status, detail.slice(0, 500))
        return jsonResponse({ error: 'draft_failed', message: 'AI 초안 생성에 실패했습니다.' }, 502)
      }
      const data = (await resp.json().catch(() => ({}))) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
      }
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      const draft = parseDraft(text)
      if (!draft || !draft.body) {
        console.error('[ai-minute-draft] 파싱 실패', text.slice(0, 500))
        return jsonResponse({ error: 'draft_failed', message: 'AI 응답을 해석하지 못했습니다.' }, 502)
      }
      return jsonResponse(draft)
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError'
      return jsonResponse(
        { error: aborted ? 'timeout' : 'server_error', message: aborted ? 'AI 초안 생성이 지연되어 취소했습니다.' : 'AI 초안 생성 중 오류가 발생했습니다.' },
        aborted ? 504 : 500,
      )
    } finally {
      clearTimeout(timer)
    }
  }),
)
