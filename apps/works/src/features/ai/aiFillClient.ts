import { useMutation } from '@tanstack/react-query'
import type { ExtractBody } from '@docparse/types.ts'
import { supabase } from '@/lib/supabase'
import { isLinkMaterial, materialDisplayName, type Material } from '@/features/networks/materialHooks'
import { materialLocationLabel } from '@/features/networks/materialRefs'
import { isAiReadable } from '@/features/ai/aiFormats'

import type { AiFillEnvelope } from '@/features/ai/aiTypes'

/**
 * 'AI 작성하기' 호출부 — 대상별 Edge Function(어느 함수인지는 카탈로그가 답한다).
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
   * 14MB는 공급자의 절대 한도가 아니라 Edge Function의 원본·base64·JSON 동시 메모리를
   * 위한 보수적 전환점이다. 서버가 큰 자료는 먼저 올린 뒤 주소만 참조하므로 담당자는 두
   * 방식의 갈림을 알 필요가 없고 합계 하나만 본다.
   */
  maxTotalBytes: 50 * 1024 * 1024,
  /** 한 건 상한(30MB). 합이 되어도 한 파일이 전부를 먹으면 나머지가 모델에 닿지 못한다. */
  maxSingleBytes: 30 * 1024 * 1024,
  /**
   * 한 번의 실행이 걸릴 수 있는 최대 시간(서버 `TIMEOUT_MS`와 같은 값).
   *
   * 서버는 이 시간이 지나면 그때까지 된 카드만 돌려준다 — 게이트웨이가 150초에 끊으므로
   * 늘릴 수 없는 값이다. 화면은 이 값을 **기다리는 동안의 눈금**으로만 쓴다(요청을 끊는 것은
   * 서버다). 서버 값이 바뀌면 이 숫자도 함께 바꾼다 — 눈금이 실제보다 짧으면 끝났어야 할
   * 시간에 계속 도는 것으로, 길면 끝난 뒤에도 남은 것으로 읽힌다.
   */
  maxRunMs: 125_000,
  /** 실측에서 대개 걸리는 구간(2026-09-11: 54~111초). 안내 문구 하나에만 쓴다. */
  typicalRunMs: [60_000, 120_000],
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
  | {
      kind: 'attachment'
      key: string
      name: string
      bytes: number | null
      readable: boolean
      id: string
      /**
       * 이 첨부가 링크면 그 주소, 파일이면 null.
       *
       * 종전에는 `bytes === null`이 링크를 뜻했다. 자료 분석이 붙으면서 **종류를 물어야 하는
       * 자리가 생겼으므로**(링크는 서버가 가져오고 파일은 브라우저가 연다) 값을 그대로 든다 —
       * 크기가 없다는 것과 링크라는 것은 다른 사실이고, 앞으로 크기가 비는 파일이 생기면
       * 그 추측이 조용히 틀린다.
       */
      url: string | null
      /** 원장에 적힌 형식 값. 분석 대상인지(PDF·이미지는 아니다) 가릴 때 쓴다. */
      contentType: string | null
      /**
       * 이 자료가 사는 곳의 이름. **다른 대상에서 참조해 온 자료에만 붙는다**(2026-09-08).
       *
       * 이 화면 자기 자료에는 비워 둔다 — 전부에 붙이면 같은 말이 모든 줄에 서서 정작
       * 어느 줄이 남의 것인지가 그 반복에 묻힌다. 자료 관리 카드에서는 위치가 소제목으로
       * 갈려 있지만 이 격자에서는 두 곳의 자료가 한 목록에 섞이므로, 같은 이름의 파일이
       * 양쪽에 있을 때 무엇을 고르는지 답할 것이 필요하다.
       */
      origin?: string
    }
  | { kind: 'file'; key: string; name: string; bytes: number | null; readable: boolean; file: File }
  | { kind: 'link'; key: string; name: string; bytes: number | null; readable: boolean; url: string }

/**
 * 이미 올라간 자료 목록을 출처로 바꾼다(수정 모드 — 파일과 링크 모두).
 *
 * `ownTargetType`을 주면 **그 대상의 것이 아닌 줄에만** 위치 이름이 붙는다(참조 자료).
 * 위치를 호출부가 글자로 적어 넘기지 않는 것이 요점이다 — 어디서 왔는지는 행 자신이
 * `target_type`으로 말하고 있고, 그 답을 화면이 손으로 다시 적으면 참조가 늘어날 때마다
 * 호출부가 방향표를 한 벌 더 갖게 된다.
 */
export function sourcesFromMaterials(materials: Material[], ownTargetType?: string): AiSource[] {
  return materials.map((m) => ({
    kind: 'attachment',
    key: m.id,
    id: m.id,
    name: materialDisplayName(m),
    // 링크에는 용량이 없다. 합산 표시에서 0으로 세지 않도록 null을 그대로 넘긴다.
    bytes: isLinkMaterial(m) ? null : m.byte_size,
    readable: isAiReadable(m),
    url: isLinkMaterial(m) ? m.url : null,
    contentType: m.content_type,
    origin:
      ownTargetType && m.target_type !== ownTargetType
        ? (materialLocationLabel(m.target_type) ?? undefined)
        : undefined,
  }))
}

/** File 실물이 살아 있는 동안 변하지 않는 등록 모드 자료 키. */
const pendingFileKeys = new WeakMap<File, string>()
let pendingFileSequence = 0

/**
 * 배열 순서가 아니라 File 실물에 붙는 키.
 *
 * 같은 이름의 파일 둘 중 앞 파일을 지우면 배열 index가 당겨진다. index를 키로 쓰면 남은
 * 파일이 지워진 파일의 자리(읽을지 말지)를 이어받으므로 File 객체에 실행 중 안정 키를 준다.
 */
function pendingFileKey(file: File): string {
  const found = pendingFileKeys.get(file)
  if (found) return found
  pendingFileSequence += 1
  const key = `file:${pendingFileSequence}:${file.name}`
  pendingFileKeys.set(file, key)
  return key
}

/** 아직 올라가지 않은 보류 파일을 출처로 바꾼다(등록 모드). */
export function sourcesFromFiles(files: File[]): AiSource[] {
  return files.map((f) => ({
    kind: 'file',
    // 파일은 id가 없지만 배열 순번도 정체성이 아니다. 위 WeakMap의 안정 키를 쓴다.
    key: pendingFileKey(f),
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

type AiFillResponse<K extends string> = AiFillEnvelope<K> & {
  skippedSources?: string[]
  model?: string
  modelVersion?: string
  elapsedMs?: number
  message?: string
}

/** 초안 봉투 + 읽지 못한 자료 안내 + 작성하지 못한 카드. */
export type AiFillResult<K extends string> = AiFillEnvelope<K> & { skippedSources: string[] }

export interface AiFillInput<K extends string> {
  /** Abort the in-flight AI request when the user cancels. */
  signal?: AbortSignal
  /**
   * 두드릴 Edge Function 이름.
   *
   * 대상마다 함수가 얇게 서므로(권한을 묻는 함수가 다르고, 함수 이름이 곧 감사 로그와 배포의
   * 경계다) 화면도 어느 문을 두드릴지를 함께 넘긴다. 카탈로그가 이 값을 소유한다.
   */
  endpoint: string
  /** 수정 모드의 대상 id. 등록 모드에는 아직 없다. */
  targetId?: string
  /**
   * 등록 모드에서 폼이 방금 고른 참조 연결(스타트업 id 등).
   *
   * 가리킬 대상 행이 아직 없으므로 참조를 서버가 저장된 값에서 찾을 수 없다. 이 값을 주면
   * 서버가 같은 방향 함수에 후보로 넣어 판정한다 — 열람 자격은 여전히 그 원장의 RLS가 본다.
   */
  linkId?: string | null
  /** 프롬프트에 실을 대상의 이름. 등록 모드에서 폼에 적힌 이름을 넘긴다. */
  subjectName?: string
  /**
   * 읽을 자료(상 칸) 전부. 카드가 몇이든 자료는 한 번만 올라가고 **모든 카드가 함께 읽는다**
   * (2026-09-09 — 카드별 배정을 걷었다). 카드가 많을 때 탐색 축으로 나누는 일은 서버가 한다.
   */
  sources: AiSource[]
  cards: K[]
  /**
   * 등록 모드에서 **이미 분석된 보류 자료**의 글자(자료 키 → 이름과 본문).
   *
   * 저장할 자리가 없어(첨부 행이 아직 없다) 화면이 결과를 들고 있다가 작성 요청에 함께
   * 싣는다. 여기 담긴 자료는 파일 자체를 보내지 않는다 — 그것이 분석 단계를 둔 이유다.
   * 수정 모드에서는 서버가 캐시 원장에서 직접 읽으므로 이 칸이 비어 있다.
   */
  extracts?: Record<string, { name: string; body: ExtractBody }>
}

/**
 * functions.invoke 에러에서 서버가 담은 한국어 메시지를 끌어낸다.
 * FunctionsHttpError는 응답 본문(context)에 { message }를 담는다(voiceMinuteApi와 같은 규약).
 */
export async function readInvokeError(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: unknown }).context
  if (ctx instanceof Response) {
    const body = await ctx.json().catch(() => null)
    if (body?.message) return String(body.message)
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function buildUploadBody<K extends string>(input: AiFillInput<K>): FormData {
  const form = new FormData()
  form.append('cards', JSON.stringify(input.cards))
  // 이름 칸은 `subjectName`이다 — 대상이 기업만은 아니게 되면서 공통 이름이 됐다(서버는
  // 옛 이름 `companyName`도 아직 받는다).
  if (input.subjectName) form.append('subjectName', input.subjectName)
  // 파일에는 id가 없으므로 **화면이 만든 키를 파일과 같은 순서로 함께 보낸다.** 순번을 서버가
  // 다시 세면 담당자가 자료를 골라 보낼 때 그 순번이 화면의 것과 어긋나, 분석 글자가 엉뚱한
  // 자료에 붙는다. 링크는 주소가 곧 키라 양쪽이 따로 만들어도 같은 값이 나온다.
  const extracts = input.extracts ?? {}
  const fileKeys: string[] = []
  // 등록 모드에도 **이미 원장에 있는 자료**가 섞인다(참조). 그것은 파일을 실어 보내지 않고
  // id로 가리킨다 — 서버가 RLS로 그 행을 볼 자격을 판정하고, 캐시된 조각도 그대로 쓴다.
  const attachmentIds: string[] = []
  for (const s of input.sources) {
    if (s.kind === 'attachment') {
      attachmentIds.push(s.id)
      continue
    }
    // 이미 분석된 자료는 **파일도 주소도 보내지 않는다.** 글자가 아래에 함께 실리므로
    // 원본을 또 보내면 같은 자료를 두 모양으로 읽히게 되고, 큰 파일이 그대로 다시 올라간다.
    if (extracts[s.key]) continue
    if (s.kind === 'file') {
      form.append('files', s.file, s.name)
      fileKeys.push(s.key)
    } else if (s.kind === 'link') {
      form.append('links', s.url)
    }
  }
  form.append('fileKeys', JSON.stringify(fileKeys))
  if (attachmentIds.length > 0) form.append('attachmentIds', JSON.stringify(attachmentIds))
  if (input.linkId) form.append('linkId', input.linkId)
  if (Object.keys(extracts).length > 0) form.append('extracts', JSON.stringify(extracts))
  return form
}

/**
 * 초안을 받아온다. **대상 행이 있는가가 요청 모양을 정한다**(2026-09-08 정정).
 *
 * 종전에는 '보류 자료가 하나라도 있으면 등록 모드'였다. 그 판정은 등록 화면에서 **참조 자료만**
 * 고른 경우를 놓친다 — 참조는 이미 원장에 있는 행이라 보류가 아니고, 그래서 요청이 수정 모드로
 * 나가 대상 id 없이 거절됐다. 모드를 가르는 진짜 질문은 자료의 종류가 아니라 **가리킬 행이
 * 있는가**이고, 서버가 자격을 달리 묻는 근거도 그것이다(§8.2).
 */
export async function requestAiFill<K extends string>(input: AiFillInput<K>): Promise<AiFillResult<K>> {
  const isCreate = !input.targetId
  const body = isCreate
    ? buildUploadBody(input)
    : {
        // 대상 id의 이름은 `targetId`다 — 함수가 대상마다 얇게 서면서 공통 이름이 됐다.
        targetId: input.targetId,
        attachmentIds: input.sources.map((s) => (s.kind === 'attachment' ? s.id : '')).filter(Boolean),
        cards: input.cards,
      }

  const { data, error } = await supabase.functions.invoke<AiFillResponse<K>>(input.endpoint, {
    body,
    signal: input.signal,
  })
  if (error) throw new Error(await readInvokeError(error, 'AI 작성에 실패했습니다.'))
  if (!data?.cards) throw new Error('AI 응답이 비어 있습니다.')
  return {
    cards: data.cards,
    notes: data.notes ?? {},
    evidence: data.evidence ?? {},
    skippedSources: data.skippedSources ?? [],
    // 한 요청이 실패해도 나머지 카드는 온다. 실패한 카드는 값이 아니라 **이름과 사유**로 온다 —
    // 그 카드의 폼 값을 건드리지 않기 위해서다(없는 카드는 병합이 그대로 둔다).
    failedCards: data.failedCards ?? [],
    // 문장을 다듬지 못한 사유. 값은 이미 들어 있으므로 카드 실패와 갈라 나른다.
    composeFailed: data.composeFailed ?? null,
  }
}

/** 모달이 쓰는 뮤테이션. 서버가 DB를 건드리지 않으므로 무효화할 쿼리도 없다. */
export function useAiFill<K extends string>() {
  return useMutation({ mutationFn: (input: AiFillInput<K>) => requestAiFill(input) })
}
