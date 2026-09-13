// 저장된 회의 녹음 구간을 서버에서 전사한다.
// 요청: { segmentId }, 응답: { text }. 소유자 + office write만 처리할 수 있다.
// 원본을 외부 AI로 보내기 전에 access_logs 적재가 반드시 성공해야 한다.
import { jsonResponse, requireStrictBrowserOrigin, withCors } from '../_shared/cors.ts'
import { resolveOfficeWriter, supabaseAsCaller } from '../_shared/internalAuth.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { withinMeetingAiQuota } from '../_shared/aiQuota.ts'

const BUCKET = 'meeting-recordings'
const MAX_BYTES = 14 * 1024 * 1024

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

Deno.serve(withCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)
  const originError = requireStrictBrowserOrigin(req)
  if (originError) return originError

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401)
  const appUserId = await resolveOfficeWriter(token)
  if (!appUserId) return jsonResponse({ error: 'forbidden' }, 403)

  const input = (await req.json().catch(() => ({}))) as { segmentId?: string }
  const segmentId = String(input.segmentId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(segmentId)) return jsonResponse({ error: 'invalid_request' }, 400)

  // 호출자 토큰 쿼리로 RLS를 먼저 통과시킨 뒤, 소유자만 비용 발생 작업을 시작한다.
  const caller = supabaseAsCaller(token)
  const { data: segment, error: segmentError } = await caller
    .from('meeting_recording_segments')
    .select('id, recording_id, storage_path, mime_type, byte_size, status, transcript, attempt_count')
    .eq('id', segmentId)
    .maybeSingle()
  if (segmentError) return jsonResponse({ error: 'internal_error' }, 500)
  if (!segment) return jsonResponse({ error: 'forbidden' }, 403)

  const { data: recording } = await caller
    .from('meeting_recordings')
    .select('id, owner_id')
    .eq('id', segment.recording_id)
    .maybeSingle()
  if (!recording || recording.owner_id !== appUserId) return jsonResponse({ error: 'forbidden' }, 403)
  if (segment.status === 'READY' && segment.transcript) {
    return jsonResponse({ text: segment.transcript })
  }
  if (Number(segment.attempt_count) >= 3) {
    return jsonResponse({ error: 'retry_exhausted', message: '이 구간의 자동 재시도 횟수를 초과했습니다.' }, 429)
  }
  if (Number(segment.byte_size) > MAX_BYTES) return jsonResponse({ error: 'too_large' }, 413)

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) return jsonResponse({ error: 'not_configured' }, 503)
  const model = Deno.env.get('GEMINI_TRANSCRIBE_MODEL') ?? Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'
  const admin = supabaseAdmin()

  if (!(await withinMeetingAiQuota(appUserId, 'transcription'))) {
    return jsonResponse({ error: 'rate_limited', message: '시간당 음성 처리 한도를 초과했습니다.' }, 429)
  }
  const { error: logError } = await admin.from('access_logs').insert({
    user_id: appUserId,
    resource_type: 'meeting_recording_ai_transcription',
    resource_id: recording.id,
    reason: `회의 녹음 구간 AI 전사: ${segment.id}`,
  })
  if (logError) return jsonResponse({ error: 'log_failed', message: 'AI 처리 기록을 남기지 못했습니다.' }, 500)

  await admin.from('meeting_recording_segments').update({
    status: 'TRANSCRIBING', error_code: null, attempt_count: Number(segment.attempt_count) + 1,
  }).eq('id', segment.id)

  const { data: object, error: downloadError } = await admin.storage
    .from(BUCKET)
    .download(segment.storage_path)
  if (downloadError || !object) {
    await admin.from('meeting_recording_segments').update({ status: 'FAILED', error_code: 'storage_read_failed' }).eq('id', segment.id)
    return jsonResponse({ error: 'storage_read_failed' }, 502)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [
          { text: '다음은 한국어 회의 녹음의 한 구간입니다. 요약하지 말고 발화 내용을 정확히 전사하세요. 화자를 확실히 구분할 수 있을 때만 화자 표기를 포함하세요.' },
          { inlineData: { mimeType: segment.mime_type, data: toBase64(await object.arrayBuffer()) } },
        ] }],
        generationConfig: { temperature: 0 },
      }),
    })
    if (!response.ok) {
      console.error('[meeting-recording-process] gemini', response.status, (await response.text()).slice(0, 500))
      await admin.from('meeting_recording_segments').update({ status: 'FAILED', error_code: 'provider_failed' }).eq('id', segment.id)
      return jsonResponse({ error: 'transcription_failed', message: '음성 전사에 실패했습니다.' }, 502)
    }
    const result = (await response.json().catch(() => ({}))) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const text = (result.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '').trim()
    if (!text) {
      await admin.from('meeting_recording_segments').update({ status: 'FAILED', error_code: 'empty_transcript' }).eq('id', segment.id)
      return jsonResponse({ error: 'empty_transcript' }, 502)
    }
    const { error: updateError } = await admin.from('meeting_recording_segments').update({
      status: 'READY', transcript: text, error_code: null, transcribed_at: new Date().toISOString(),
    }).eq('id', segment.id)
    if (updateError) return jsonResponse({ error: 'save_failed' }, 500)
    return jsonResponse({ text })
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === 'AbortError'
    await admin.from('meeting_recording_segments').update({
      status: 'FAILED', error_code: timeout ? 'timeout' : 'server_error',
    }).eq('id', segment.id)
    return jsonResponse({ error: timeout ? 'timeout' : 'server_error' }, timeout ? 504 : 500)
  } finally {
    clearTimeout(timer)
  }
}))
