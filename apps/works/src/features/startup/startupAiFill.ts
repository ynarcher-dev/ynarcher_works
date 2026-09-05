import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isLinkMaterial, materialDisplayName, type Material } from '@/features/networks/materialHooks'
import { isAiReadable } from '@/features/startup/startupAiFormats'
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
  /**
   * 합산 상한(50MB).
   *
   * 종전 14MB는 우리가 고른 값이 아니라 **요청에 실어 보내는 방식의 벽**이었다(모델의 한 요청
   * 20MB에서 문자 변환 팽창분을 뺀 값). 서버가 큰 자료는 먼저 올린 뒤 주소만 참조하도록
   * 바뀌면서 그 벽이 사라졌다. 담당자는 두 방식의 갈림을 알 필요가 없고 합계 하나만 본다.
   */
  maxTotalBytes: 50 * 1024 * 1024,
  /** 한 건 상한(30MB). 합이 되어도 한 파일이 전부를 먹으면 나머지가 모델에 닿지 못한다. */
  maxSingleBytes: 30 * 1024 * 1024,
} as const

// 개수 상한은 두지 않는다 — 합계 안에서만 이뤄지면 몇 건인지는 물어볼 일이 아니다.
// 개수가 대신 막고 있던 둘(글자 계열의 밀도 · 링크에 드는 시간)은 서버가 제 이름으로 막고,
// 걸리면 그 건만 사유와 함께 빠진다. 화면이 미리 셀 수 있는 값이 아니라 여기 두지 않는다.

/**
 * 읽을 자료 한 건 — 세 경로를 한 목록으로 세우기 위한 표시 단위.
 *
 * 모달은 세 경로의 차이를 알 필요가 없다. **고르는 일은 같고 보내는 일만 다르기** 때문이다.
 *   * `attachment` — 이미 올라간 자료(파일이든 링크든). id만 보내고 서버가 RLS로 판정한다.
 *   * `file` — 등록 모드의 보류 파일. 파일 자체를 보낸다.
 *   * `link` — 등록 모드의 보류 링크. 주소만 보내고 서버가 가져온다.
 */
export type AiSource =
  | { kind: 'attachment'; key: string; name: string; bytes: number | null; readable: boolean; id: string }
  | { kind: 'file'; key: string; name: string; bytes: number | null; readable: boolean; file: File }
  | { kind: 'link'; key: string; name: string; bytes: number | null; readable: boolean; url: string }

/** 이미 올라간 자료 목록을 출처로 바꾼다(수정 모드 — 파일과 링크 모두). */
export function sourcesFromMaterials(materials: Material[]): AiSource[] {
  return materials.map((m) => ({
    kind: 'attachment',
    key: m.id,
    id: m.id,
    name: materialDisplayName(m),
    // 링크에는 용량이 없다. 합산 표시에서 0으로 세지 않도록 null을 그대로 넘긴다.
    bytes: isLinkMaterial(m) ? null : m.byte_size,
    readable: isAiReadable(m),
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
    readable: isAiReadable({ kind: 'FILE', content_type: f.type, file_name: f.name } as Material),
    file: f,
  }))
}

/** 아직 올라가지 않은 보류 링크를 출처로 바꾼다(등록 모드). */
export function sourcesFromLinks(urls: string[]): AiSource[] {
  return urls.map((url) => ({
    kind: 'link',
    key: `link:${url}`,
    name: url,
    bytes: null,
    // 링크는 열어 봐야 안다 — 미리 잠그지 않는다(startupAiFormats.isAiReadable 주석 참조).
    readable: true,
    url,
  }))
}

type AiFillResponse = AiFillEnvelope & {
  skippedSources?: string[]
  model?: string
  elapsedMs?: number
  message?: string
}

/** 초안 봉투 + 읽지 못한 자료 안내. */
export type AiFillResult = AiFillEnvelope & { skippedSources: string[] }

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

function buildUploadBody(input: AiFillInput): FormData {
  const form = new FormData()
  form.append('cards', JSON.stringify(input.cards))
  if (input.companyName) form.append('companyName', input.companyName)
  for (const s of input.sources) {
    if (s.kind === 'file') form.append('files', s.file, s.name)
    else if (s.kind === 'link') form.append('links', s.url)
  }
  return form
}

/**
 * 초안을 받아온다. **출처의 종류가 요청 모양을 정한다.**
 *
 * 아직 원장에 없는 것(보류 파일·보류 링크)이 하나라도 있으면 등록 모드로 보낸다 — 그것들은
 * 가리킬 행이 없어 id로 말할 수 없기 때문이다. 두 모드를 섞어 보내지 않는 이유는 서버가
 * 경로마다 **다른 자격**을 묻기 때문이다(§8.2).
 */
export async function requestAiFill(input: AiFillInput): Promise<AiFillResult> {
  const hasPending = input.sources.some((s) => s.kind !== 'attachment')
  const body = hasPending
    ? buildUploadBody(input)
    : {
        startupId: input.startupId,
        attachmentIds: input.sources.map((s) => (s.kind === 'attachment' ? s.id : '')).filter(Boolean),
        cards: input.cards,
      }

  const { data, error } = await supabase.functions.invoke<AiFillResponse>('startup-ai-fill', { body })
  if (error) throw new Error(await readInvokeError(error, 'AI 작성에 실패했습니다.'))
  if (!data?.cards) throw new Error('AI 응답이 비어 있습니다.')
  return {
    cards: data.cards,
    notes: data.notes ?? {},
    evidence: data.evidence ?? {},
    skippedSources: data.skippedSources ?? [],
  }
}

/** 모달이 쓰는 뮤테이션. 서버가 DB를 건드리지 않으므로 무효화할 쿼리도 없다. */
export function useAiFill() {
  return useMutation({ mutationFn: requestAiFill })
}
