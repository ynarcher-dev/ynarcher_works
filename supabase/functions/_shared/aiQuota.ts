import { supabaseAdmin } from './supabaseAdmin.ts'

const TRANSCRIPTION_TYPES = [
  'meeting_audio_ai_transcription',
  'meeting_recording_ai_transcription',
]

/** 계정 탈취·오작동이 무제한 AI 비용으로 번지는 것을 막는 시간당 상한. 조회 실패도 차단한다. */
export async function withinMeetingAiQuota(
  userId: string,
  kind: 'transcription' | 'draft',
): Promise<boolean> {
  const resourceTypes = kind === 'transcription'
    ? TRANSCRIPTION_TYPES
    : ['meeting_transcript_ai_draft']
  const limit = kind === 'transcription' ? 72 : 20
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error } = await supabaseAdmin()
    .from('access_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('resource_type', resourceTypes)
    .gte('created_at', since)
  return !error && (count ?? limit) < limit
}
