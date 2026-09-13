// 회의 녹음 세션의 구간별 단기 재생 URL을 한 번에 발급한다.
// RLS를 통과한 사용자에게만 제공하며, access_logs 실패 시 URL을 내주지 않는다.
import { jsonResponse, requireStrictBrowserOrigin, withCors } from '../_shared/cors.ts'
import { resolveInternalCaller, supabaseAsCaller } from '../_shared/internalAuth.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const BUCKET = 'meeting-recordings'
const TTL_SECONDS = 60

Deno.serve(withCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)
  const originError = requireStrictBrowserOrigin(req)
  if (originError) return originError
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401)
  const appUserId = await resolveInternalCaller(token)
  if (!appUserId) return jsonResponse({ error: 'unauthorized' }, 401)

  const input = (await req.json().catch(() => ({}))) as { recordingId?: string }
  const recordingId = String(input.recordingId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(recordingId)) return jsonResponse({ error: 'invalid_request' }, 400)

  const caller = supabaseAsCaller(token)
  const { data: recording } = await caller
    .from('meeting_recordings').select('id').eq('id', recordingId).maybeSingle()
  if (!recording) return jsonResponse({ error: 'forbidden' }, 403)
  const { data: segments, error: segmentError } = await caller
    .from('meeting_recording_segments')
    .select('id, segment_no, storage_path, file_name, duration_ms')
    .eq('recording_id', recordingId)
    .in('status', ['UPLOADED', 'TRANSCRIBING', 'READY', 'FAILED'])
    .order('segment_no')
  if (segmentError) return jsonResponse({ error: 'internal_error' }, 500)

  const admin = supabaseAdmin()
  const { error: logError } = await admin.from('access_logs').insert({
    user_id: appUserId,
    resource_type: 'meeting_recording_playback',
    resource_id: recordingId,
    reason: '회의 녹음 재생',
  })
  if (logError) return jsonResponse({ error: 'log_failed', message: '재생 기록을 남기지 못했습니다.' }, 500)

  const output = []
  for (const segment of segments ?? []) {
    const { data: signed, error } = await admin.storage
      .from(BUCKET).createSignedUrl(segment.storage_path, TTL_SECONDS)
    if (error || !signed) return jsonResponse({ error: 'sign_failed' }, 500)
    output.push({
      id: segment.id,
      segmentNo: segment.segment_no,
      fileName: segment.file_name,
      durationMs: segment.duration_ms,
      url: signed.signedUrl,
    })
  }
  return jsonResponse({ segments: output })
}))
