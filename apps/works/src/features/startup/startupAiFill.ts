import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AiCardKey } from '@/features/startup/startupAiCards'
import type { AiFillEnvelope } from '@/features/startup/startupAiMerge'

/**
 * 'AI 작성하기' 호출부 — startup-ai-fill Edge Function.
 *
 * 이 훅은 **아무것도 저장하지 않는다.** 서버도 원장을 쓰지 않고 초안 봉투만 돌려주며, 저장은
 * 담당자가 폼에서 확인한 뒤 통상 저장 경로(RLS)로 한다. AI가 만든 값이 사람의 확인 없이
 * 원장에 들어가는 길을 아예 두지 않는 것이 이 기능의 계약이다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8
 */

/** 서버가 강제하는 제한값. 화면은 안내에만 쓰고, 실제 차단은 서버 응답이 답한다. */
export const AI_FILL_LIMITS = {
  /** 인라인 합산 상한(14MB) — base64 팽창 후에도 모델 요청 한도 안에 든다. */
  maxTotalBytes: 14 * 1024 * 1024,
  /** 한 번에 읽을 파일 수. */
  maxFiles: 5,
} as const

export interface AiFillInput {
  startupId: string
  attachmentIds: string[]
  cards: AiCardKey[]
}

type AiFillResponse = AiFillEnvelope & { model?: string; elapsedMs?: number; message?: string }

/**
 * functions.invoke 에러에서 서버가 담은 한국어 메시지를 끌어낸다.
 * FunctionsHttpError는 응답 본문(context)에 { message }를 담는다(voiceMinuteApi와 같은 규약).
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

/** 첨부 자료를 근거로 카드 초안을 받아온다. 실패 메시지는 서버 문구를 그대로 쓴다. */
export async function requestAiFill(input: AiFillInput): Promise<AiFillEnvelope> {
  const { data, error } = await supabase.functions.invoke<AiFillResponse>('startup-ai-fill', {
    body: input,
  })
  if (error) throw new Error(await readInvokeError(error, 'AI 작성에 실패했습니다.'))
  if (!data?.cards) throw new Error('AI 응답이 비어 있습니다.')
  return { cards: data.cards, notes: data.notes ?? {}, evidence: data.evidence ?? {} }
}

/** 모달이 쓰는 뮤테이션. 서버가 DB를 건드리지 않으므로 무효화할 쿼리도 없다. */
export function useAiFill() {
  return useMutation({ mutationFn: requestAiFill })
}
