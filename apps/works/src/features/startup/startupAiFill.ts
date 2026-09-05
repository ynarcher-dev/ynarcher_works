import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isPdfMaterial, materialDisplayName, type Material } from '@/features/networks/materialHooks'
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

/**
 * 읽을 자료 한 건 — 두 모드를 한 목록으로 세우기 위한 표시 단위.
 *
 * 수정 모드의 자료는 이미 `attachments` 행이라 id로 가리키고, 등록 모드의 자료는 아직 원장에
 * 없어 파일 자체를 보낸다. 모달이 그 차이를 알 필요는 없으므로 여기서 한 모양으로 덮는다 —
 * 고르는 일과 보내는 일 중 **고르는 일만** 같기 때문이다.
 */
export type AiSource =
  | { kind: 'attachment'; key: string; name: string; bytes: number | null; pdf: boolean; id: string }
  | { kind: 'file'; key: string; name: string; bytes: number | null; pdf: boolean; file: File }

/** 이미 올라간 자료 목록을 출처로 바꾼다(수정 모드). */
export function sourcesFromMaterials(materials: Material[]): AiSource[] {
  return materials.map((m) => ({
    kind: 'attachment',
    key: m.id,
    id: m.id,
    name: materialDisplayName(m),
    bytes: m.byte_size,
    pdf: isPdfMaterial(m),
  }))
}

/** 아직 올라가지 않은 보류 파일을 출처로 바꾼다(등록 모드). */
export function sourcesFromFiles(files: File[]): AiSource[] {
  return files.map((f, i) => ({
    kind: 'file',
    // 파일은 id가 없다. 같은 이름을 두 번 담을 수 있으므로 순번을 함께 넣어 키를 유일하게 만든다.
    key: `file:${i}:${f.name}`,
    name: f.name,
    bytes: f.size,
    pdf: f.type === 'application/pdf' || /\.pdf$/i.test(f.name),
    file: f,
  }))
}

type AiFillResponse = AiFillEnvelope & { model?: string; elapsedMs?: number; message?: string }

export interface AiFillInput {
  /** 수정 모드의 대상 id. 등록 모드에는 아직 없다. */
  startupId?: string
  /** 대상 기업명(프롬프트 맥락). 등록 모드에서 폼에 적힌 이름을 넘긴다. */
  companyName?: string
  sources: AiSource[]
  cards: AiCardKey[]
}

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

/**
 * 초안을 받아온다. 출처의 종류가 요청 모양을 정한다 —
 * 첨부는 id만 보내고(서버가 RLS로 그 행을 볼 자격을 판정한다), 보류 파일은 파일 자체를 보낸다.
 * 섞어 보내지 않는 이유는 서버가 두 경로에서 **다른 자격**을 묻기 때문이다(§8.2).
 */
export async function requestAiFill(input: AiFillInput): Promise<AiFillEnvelope> {
  const pending = input.sources.filter((s) => s.kind === 'file')
  const body =
    pending.length > 0
      ? buildUploadBody(pending as Extract<AiSource, { kind: 'file' }>[], input)
      : {
          startupId: input.startupId,
          attachmentIds: input.sources.map((s) => (s.kind === 'attachment' ? s.id : '')).filter(Boolean),
          cards: input.cards,
        }

  const { data, error } = await supabase.functions.invoke<AiFillResponse>('startup-ai-fill', { body })
  if (error) throw new Error(await readInvokeError(error, 'AI 작성에 실패했습니다.'))
  if (!data?.cards) throw new Error('AI 응답이 비어 있습니다.')
  return { cards: data.cards, notes: data.notes ?? {}, evidence: data.evidence ?? {} }
}

function buildUploadBody(files: Extract<AiSource, { kind: 'file' }>[], input: AiFillInput): FormData {
  const form = new FormData()
  form.append('cards', JSON.stringify(input.cards))
  if (input.companyName) form.append('companyName', input.companyName)
  for (const s of files) form.append('files', s.file, s.name)
  return form
}

/** 모달이 쓰는 뮤테이션. 서버가 DB를 건드리지 않으므로 무효화할 쿼리도 없다. */
export function useAiFill() {
  return useMutation({ mutationFn: requestAiFill })
}
