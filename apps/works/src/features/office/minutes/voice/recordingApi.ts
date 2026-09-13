import { supabase } from '@/lib/supabase'
import type { DraftContext, MinuteDraft } from './voiceMinuteApi'

const BUCKET = 'meeting-recordings'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export interface RecordingSummary {
  id: string
  status: 'RECORDING' | 'PROCESSING' | 'READY' | 'FAILED'
  durationMs: number
  createdAt: string
  transcript: string | null
  draft: MinuteDraft | null
  segmentCount: number
}

interface RecordingRow {
  id: string
  status: RecordingSummary['status']
  duration_ms: number
  created_at: string
  transcript: string | null
  ai_draft: MinuteDraft | null
  meeting_recording_segments?: { count: number }[]
}

function extension(mimeType: string): string {
  if (mimeType === 'audio/webm') return 'webm'
  if (mimeType === 'audio/mp4' || mimeType === 'audio/x-m4a') return 'm4a'
  if (mimeType === 'audio/ogg') return 'ogg'
  if (mimeType === 'audio/mpeg' || mimeType === 'audio/mp3') return 'mp3'
  if (mimeType === 'audio/aac') return 'aac'
  return 'wav'
}

export async function startRecording(minuteId?: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_meeting_recording', {
    p_minute_id: minuteId ?? null,
  })
  if (error) throw error
  return String(data)
}

export async function saveRecordingSegment(
  recordingId: string,
  segmentNo: number,
  blob: Blob,
  durationMs: number,
): Promise<string> {
  const segmentId = crypto.randomUUID()
  const mimeType = (blob.type || 'audio/webm').split(';')[0] ?? 'audio/webm'
  const ext = extension(mimeType)
  const storagePath = `${recordingId}/${segmentId}.${ext}`
  const fileName = `회의녹음-${String(segmentNo).padStart(3, '0')}.${ext}`

  const { error: prepareError } = await supabase.rpc('prepare_meeting_recording_segment', {
    p_segment_id: segmentId,
    p_recording_id: recordingId,
    p_segment_no: segmentNo,
    p_storage_path: storagePath,
    p_file_name: fileName,
    p_mime_type: mimeType,
    p_byte_size: blob.size,
    p_duration_ms: Math.round(durationMs),
  })
  if (prepareError) throw prepareError

  let lastUploadError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, blob, { contentType: mimeType, upsert: false })
    if (!uploadError) {
      lastUploadError = null
      break
    }
    lastUploadError = uploadError
    // 응답만 유실되고 파일은 저장됐을 수 있다. 완료 RPC가 확인해 주면 재업로드하지 않는다.
    const { error: probeError } = await supabase.rpc('complete_meeting_recording_segment', {
      p_segment_id: segmentId,
    })
    if (!probeError) return segmentId
    if (attempt < 2) await delay(500 * (attempt + 1))
  }
  if (lastUploadError) throw lastUploadError

  const { error: completeError } = await supabase.rpc('complete_meeting_recording_segment', {
    p_segment_id: segmentId,
  })
  if (completeError) throw completeError
  return segmentId
}

export async function transcribeRecordingSegment(segmentId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('meeting-recording-process', {
    body: { segmentId },
  })
  if (error) throw new Error('저장된 녹음 구간의 음성 인식에 실패했습니다.')
  const text = String((data as { text?: string } | null)?.text ?? '').trim()
  if (!text) throw new Error('음성 인식 결과가 비어 있습니다.')
  return text
}

export async function finishRecording(recordingId: string, durationMs: number): Promise<void> {
  const { error } = await supabase.rpc('finish_meeting_recording', {
    p_recording_id: recordingId,
    p_duration_ms: Math.round(durationMs),
  })
  if (error) throw error
}

export async function completeRecording(
  recordingId: string,
  transcript: string,
  draft: MinuteDraft,
): Promise<void> {
  const { error } = await supabase.rpc('complete_meeting_recording', {
    p_recording_id: recordingId,
    p_transcript: transcript,
    p_ai_draft: draft,
  })
  if (error) throw error
}

export async function attachRecording(recordingId: string, minuteId: string): Promise<void> {
  const { error } = await supabase.rpc('attach_meeting_recording', {
    p_recording_id: recordingId,
    p_minute_id: minuteId,
  })
  if (error) throw error
}

export async function listRecordings(minuteId?: string): Promise<RecordingSummary[]> {
  let query = supabase
    .from('meeting_recordings')
    .select('id, status, duration_ms, created_at, transcript, ai_draft, meeting_recording_segments(count)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  query = minuteId ? query.eq('minute_id', minuteId) : query.is('minute_id', null)
  const { data, error } = await query.limit(10)
  if (error) throw error
  return ((data ?? []) as unknown as RecordingRow[]).map((row) => ({
    id: row.id,
    status: row.status,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    transcript: row.transcript,
    draft: row.ai_draft,
    segmentCount: row.meeting_recording_segments?.[0]?.count ?? 0,
  }))
}

/** 중단된 세션에서 저장된 구간만 순서대로 재전사한다. 이미 성공한 구간은 재과금하지 않는다. */
export async function recoverRecordingTranscripts(
  recordingId: string,
): Promise<{ transcript: string; durationMs: number }> {
  const { data, error } = await supabase
    .from('meeting_recording_segments')
    .select('id, segment_no, duration_ms, status, transcript')
    .eq('recording_id', recordingId)
    .order('segment_no')
  if (error) throw error
  if (!data?.length) throw new Error('복구할 녹음 구간이 없습니다.')

  const parts: string[] = []
  let durationMs = 0
  for (const row of data as {
    id: string
    segment_no: number
    duration_ms: number
    status: string
    transcript: string | null
  }[]) {
    durationMs += row.duration_ms
    parts.push(row.status === 'READY' && row.transcript
      ? row.transcript
      : await transcribeRecordingSegment(row.id))
  }
  return { transcript: parts.join('\n\n').trim(), durationMs }
}

export interface PlaybackSegment {
  id: string
  segmentNo: number
  fileName: string
  durationMs: number
  url: string
}

export async function getRecordingPlayback(recordingId: string): Promise<PlaybackSegment[]> {
  const { data, error } = await supabase.functions.invoke('meeting-recording-playback', {
    body: { recordingId },
  })
  if (error) throw new Error('녹음 재생 주소를 만들지 못했습니다.')
  return ((data as { segments?: PlaybackSegment[] } | null)?.segments ?? [])
}

/** 저장된 초안이 없을 때 재처리에 쓸 문맥 타입을 이 모듈에서도 공유한다. */
export type RecordingDraftContext = DraftContext
