import { supabase } from '@/lib/supabase'

/** AI가 돌려주는 회의록 초안. body는 TipTap 호환 HTML. */
export interface MinuteDraft {
  title: string
  agenda: string
  body: string
}

/** 초안 생성 시 함께 넘기는 회의 메타(맥락 보강용, 모두 선택). */
export interface DraftContext {
  title?: string
  meetingDate?: string | null
  attendees?: string[]
  agenda?: string | null
}

/**
 * 녹음 오디오를 stt-transcribe Edge Function으로 보내 전사 텍스트를 받는다.
 * 세션 토큰은 functions.invoke가 자동 첨부하며, 서버가 Whisper 호출을 대행한다.
 */
export async function transcribeAudio(blob: Blob): Promise<string> {
  const form = new FormData()
  form.append('file', blob, 'recording.wav')
  form.append('language', 'ko')

  const { data, error } = await supabase.functions.invoke<{ text?: string; message?: string }>(
    'stt-transcribe',
    { body: form },
  )
  if (error) throw new Error(await readInvokeError(error, '음성 전사에 실패했습니다.'))
  return (data?.text ?? '').trim()
}

/**
 * 전사 텍스트 + 회의 메타를 ai-minute-draft Edge Function으로 보내 회의록 초안을 받는다.
 */
export async function generateMinuteDraft(
  transcript: string,
  ctx: DraftContext,
): Promise<MinuteDraft> {
  const { data, error } = await supabase.functions.invoke<MinuteDraft & { message?: string }>(
    'ai-minute-draft',
    {
      body: {
        transcript,
        title: ctx.title || undefined,
        meetingDate: ctx.meetingDate || undefined,
        attendees: ctx.attendees?.length ? ctx.attendees : undefined,
        agenda: ctx.agenda || undefined,
      },
    },
  )
  if (error) throw new Error(await readInvokeError(error, 'AI 초안 생성에 실패했습니다.'))
  if (!data?.body) throw new Error('AI 초안 응답이 비어 있습니다.')
  return { title: data.title ?? '', agenda: data.agenda ?? '', body: data.body }
}

/**
 * functions.invoke 에러에서 서버가 담은 한국어 메시지를 최대한 끌어낸다.
 * FunctionsHttpError는 응답 본문(context)에 { message }를 담고 있다.
 */
async function readInvokeError(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: unknown }).context
  if (ctx instanceof Response) {
    const body = await ctx.json().catch(() => null)
    if (body?.message) return String(body.message)
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}
