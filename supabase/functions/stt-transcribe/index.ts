// [회의록 음성인식] 녹음 오디오(WAV) → Gemini 오디오 입력으로 전사(Speech-to-Text)
// 요청: multipart/form-data { file: 16kHz 모노 WAV, language?: 'ko' }
// 응답: { text } | 4xx/5xx
//
// 보안:
// - 인증된 내부 사용자만 호출 가능(세션 토큰 검증). UI 숨김 ≠ 보안.
// - DB를 건드리지 않는다(전사 텍스트만 반환). 저장은 상위 회의록 저장 폼이 담당.
// - 업로드 크기 상한(인라인 20MB 요청 한도를 base64 팽창까지 고려해 14MB로 강제).
// - GEMINI_API_KEY는 서버 시크릿으로만 접근하며 클라이언트로 노출하지 않는다.
// 주의: 회의 오디오는 기밀 콘텐츠이므로 Gemini(외부 AI)로 전송된다는 점이 전제되어 있다
//       (사용자가 Gemini 경로를 명시적으로 선택). ALLOWED_ORIGINS로 호출 origin을 제한할 것.
// 근거: docs/docs_dev/11_migration_security_gate.md,
//       supabase/functions/link-metadata/index.ts(인증 검증 패턴),
//       https://ai.google.dev/gemini-api/docs/audio (지원 포맷·인라인 20MB 한도)
import { jsonResponse, requireStrictBrowserOrigin, withCors } from '../_shared/cors.ts'
import { resolveOfficeWriter } from '../_shared/internalAuth.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { withinMeetingAiQuota } from '../_shared/aiQuota.ts'

/** 인라인 오디오 상한(14MB). base64 팽창(≈1.33x) 후에도 Gemini 20MB 요청 한도 안에 든다. */
const MAX_BYTES = 14 * 1024 * 1024

/** ArrayBuffer를 base64로 인코딩(청크 단위 — 대용량에서 call stack 초과 방지). */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

Deno.serve(
  withCors(async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)
    const originError = requireStrictBrowserOrigin(req)
    if (originError) return originError

    // 1) 호출자 인증(내부 사용자) ------------------------------------------------
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return jsonResponse({ error: 'unauthorized' }, 401)
    const appUserId = await resolveOfficeWriter(token)
    if (!appUserId) return jsonResponse({ error: 'forbidden' }, 403)

    // 2) 서버 시크릿 확인 --------------------------------------------------------
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) return jsonResponse({ error: 'not_configured', message: '음성인식 키가 설정되지 않았습니다.' }, 503)
    // 운영 중 결과가 갑자기 바뀌지 않도록 latest 별칭 대신 안정 버전을 기본값으로 둔다.
    const model = Deno.env.get('GEMINI_TRANSCRIBE_MODEL') ?? Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'

    // 3) 업로드 파싱 -------------------------------------------------------------
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return jsonResponse({ error: 'invalid_request', message: '오디오 업로드 형식이 올바르지 않습니다.' }, 400)
    }
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return jsonResponse({ error: 'invalid_request', message: '오디오 파일이 비어 있습니다.' }, 400)
    }
    if (file.size > MAX_BYTES) {
      return jsonResponse({ error: 'too_large', message: '오디오 구간이 너무 큽니다. 더 짧게 나눠 주세요.' }, 413)
    }
    const mime = file.type || 'audio/wav'

    // 외부 AI 반출 감사 로그가 없으면 전사를 시작하지 않는다.
    if (!(await withinMeetingAiQuota(appUserId, 'transcription'))) {
      return jsonResponse({ error: 'rate_limited', message: '시간당 음성 처리 한도를 초과했습니다.' }, 429)
    }
    const { error: logError } = await supabaseAdmin().from('access_logs').insert({
      user_id: appUserId,
      resource_type: 'meeting_audio_ai_transcription',
      resource_id: null,
      reason: `사용자 업로드 회의 음성 AI 전사 (${file.name || 'audio'})`,
    })
    if (logError) return jsonResponse({ error: 'log_failed', message: 'AI 처리 기록을 남기지 못했습니다.' }, 500)

    // 4) Gemini 전사(60초 타임아웃) — 오디오 인라인 + 전사 지시 -------------------
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60_000)
    try {
      const audioB64 = toBase64(await file.arrayBuffer())
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text:
                    '다음 오디오는 한국어 회의 녹음입니다. 내용을 있는 그대로 정확히 받아쓰기(전사)하세요. ' +
                    '요약하거나 설명을 덧붙이지 말고, 발화 텍스트만 출력하세요.',
                },
                { inlineData: { mimeType: mime, data: audioB64 } },
              ],
            },
          ],
          generationConfig: { temperature: 0 },
        }),
      })
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '')
        console.error('[stt-transcribe] gemini 오류', resp.status, detail.slice(0, 500))
        return jsonResponse({ error: 'transcription_failed', message: '음성 전사에 실패했습니다.' }, 502)
      }
      const data = (await resp.json().catch(() => ({}))) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
      }
      const text = (data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '').trim()
      return jsonResponse({ text })
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError'
      return jsonResponse(
        { error: aborted ? 'timeout' : 'server_error', message: aborted ? '음성 전사가 지연되어 취소했습니다.' : '음성 전사 중 오류가 발생했습니다.' },
        aborted ? 504 : 500,
      )
    } finally {
      clearTimeout(timer)
    }
  }),
)
