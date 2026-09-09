// [AI 작성하기] 고른 자료를 모델에 보낼 조각(parts)으로 세운다.
//
// 여기가 이 기능의 예산 관문이다. 예비 검사(sources.ts)는 **적혀 있는 크기**만 보므로 링크를
// 세지 못한다 — 가져오기 전에는 얼마나 될지 알 수 없기 때문이다. 그래서 자료를 실제로 손에
// 쥐는 이 자리에서 한 건씩 예산을 깎아 가며 다시 센다.
//
// **일을 두 단계로 가른다**(2026-09-06 개정).
//   1. `buildParts` — 자료를 손에 쥐고 **조각으로 세운다.** 여기서는 메모리 한계선만 본다.
//   2. `selectParts` — 묶음마다 **그 요청의 예산 안에서 조각을 고른다.**
//
// 가른 이유는 종전 구조가 요청 예산을 모으는 단계에서 적용해, 예산을 넘긴 자료를 **어느
// 묶음이 그것을 필요로 하는지 알기도 전에** 통째로 버렸기 때문이다. 담당자에게는 "건너뛰었다"
// 한 줄만 남고 초안에는 그 자료의 값이 하나도 반영되지 않았다. 이제는 조각 경계에서 줄여
// 담으므로 적어도 앞부분·관련된 부분은 들어간다.
//
// 보내는 방식은 합계가 정한다 —
//   * 인라인 한도 안: 요청에 실어 보낸다. **아무것도 남지 않는다**(가장 안전한 길이라 기본이다).
//   * 넘으면: Files API로 올리고 주소만 참조한다. 올린 것은 진입점이 끝나며 지운다.
// 섞지 않고 전부 한 쪽으로 보내는 이유는 판정이 하나여야 하기 때문이다 — 건별로 가르면
// "어느 자료가 어느 길로 갔는가"가 실패를 재현할 때마다 달라진다.
//
// 바깥에서 읽어 오는 두 가지(스토리지 · 링크)는 호출자가 주입한다. 이 모듈이 소유하는 것은
// **예산과 순서**뿐이고 읽는 방법은 아니다 — 그래야 예산 규칙을 망 없이 검증할 수 있다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8.3·§16.14

import type { ExtractChunk } from '../docParse/types.ts'
import { classifySourceKind } from '../docParse/sourceKind.ts'
import { sourceHeader } from './sourceKinds.ts'
import { isOfficeMime, officeChunks } from '../docParse/officeText.ts'
import { textChunks } from '../docParse/textParse.ts'
import {
  buildIndex,
  renderSource,
  selectChunks,
  sourceId,
  toSourceChunks,
  type ChunkIndex,
  type SourceChunk,
  type SourceRef,
} from './chunks.ts'
import { uploadFile, waitActive, type UploadedFile } from './filesApi.ts'
import { isTextOnlyMime } from './formats.ts'
import type { LinkContent, LinkError } from './linkRead.ts'
import {
  MAX_COLLECT_TEXT_BYTES,
  MAX_INLINE_BYTES,
  MAX_TEXT_BYTES,
  MAX_TOTAL_BYTES,
  UPLOAD_CONCURRENCY,
  mb,
} from './limits.ts'
import { runPool } from './pool.ts'
import type { ResolvedSource, SourceError } from './sources.ts'

/** ArrayBuffer를 base64로(청크 단위 — 대용량에서 call stack 초과 방지). */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export interface BuildDeps {
  apiKey: string
  signal: AbortSignal
  /** 첨부 바이트를 스토리지에서 받는다. 실패는 null. */
  download(path: string): Promise<ArrayBuffer | null>
  /** 링크를 가져온다. 남은 예산을 함께 넘겨 한 건이 전부를 먹지 못하게 한다. */
  readLink(url: string, limitBytes: number): Promise<LinkContent | LinkError>
  /**
   * 자료를 모아 오는 일을 끝내야 하는 시각(epoch ms).
   *
   * 링크는 크기가 작아도 건수만큼 시간을 먹으므로 바이트 예산으로는 못 막는다. 여기서 끊고
   * **읽은 것으로 초안을 만든다** — 전체 상한 시간에만 기대면 다 읽지도 못한 채 끝나 아무
   * 결과도 남지 않는다.
   */
  deadline: number
  /**
   * 인라인을 쓰지 않고 반드시 Files API로 올린다.
   *
   * **요청이 둘 이상으로 갈리면 켠다.** 인라인은 자료를 base64 문자열로 바꿔 요청 본문에
   * 직접 싣는 방식이라, 요청마다 사본이 따로 만들어진다 — 10MB 파일 하나가 요청 여섯 개면
   * 13MB짜리 문자열 여섯 벌이 동시에 함수 메모리에 선다. Files API는 원본 바이트를 한 번만
   * 올리고 주소만 참조하므로 요청 수와 무관하게 메모리가 파일 크기 1배다.
   */
  forceFilesApi: boolean
  /**
   * 자료 키 → **이미 분석된 조각**(2026-09-06).
   *
   * 여기 있는 자료는 원본을 내려받지도, 열지도, 올리지도 않는다. 분석 단계가 이미 한 일을
   * 실행할 때마다 다시 하지 않는 것이 이 개정의 요점이다.
   *
   * 결과적으로 **원본이 밖으로 나가지 않는다** — 오피스 파일의 바이트 대신 우리가 뽑은
   * 글자만 모델에 닿는다. 그래서 감사 로그도 무엇을 보냈는지 범위로 답할 수 있다.
   */
  extracts?: Map<string, ExtractChunk[]>
}

export interface BuiltParts {
  /**
   * 자료 키 → 그 자료가 만든 **파일 조각**(인라인 또는 Files API 참조).
   *
   * 묶음마다 조각을 다시 만들지 않고 이 지도를 함께 본다 — 자료는 한 번 내려받아 한 번
   * 올리고, 여러 요청이 같은 주소를 가리킨다. 삽입 순서가 곧 담당자가 고른 순서다.
   */
  fileParts: Map<string, unknown[]>
  /** 자료 키 → 그 자료에서 세운 **조각들**. 묶음마다 예산 안에서 골라 담는다. */
  chunks: Map<string, SourceChunk[]>
  /**
   * 자료 키 → 글자로만 이해되는 **파일**이 차지하는 바이트.
   *
   * 이 자료들은 조각이 아니라 파일 조각으로 실린다(아직 분석되지 않은 옛 경로다). 그래도
   * 모델이 읽는 것은 글자라 **같은 예산을 함께 쓴다** — 세지 않으면 2MB짜리 텍스트 파일과
   * 2MB의 조각이 한 요청에 함께 실려 예산이 조용히 두 배가 된다.
   */
  textFileBytes: Map<string, number>
  /** 이번 실행이 실제로 실어 보내는 자료들. 근거가 가리킬 수 있는 대상의 전부다. */
  sources: SourceRef[]
  /**
   * 읽지 못했거나 일부만 읽은 자료의 사유.
   *
   * 실행을 멈추지 않고 여기 쌓아 결과와 함께 알린다 — 다섯 중 하나가 비공개라고 나머지 넷까지
   * 못 읽을 이유가 없고, 대부분 담당자가 고칠 수 있는 문제(공유 설정·죽은 주소)라 조용히
   * 빠뜨리면 왜 초안이 부실한지 알 수 없다.
   */
  notices: string[]
}

interface FileItem {
  /** 이 조각이 어느 자료에서 왔는지. 묶음이 자기 몫만 골라 담는 데 쓴다. */
  key: string
  name: string
  mime: string
  bytes: ArrayBuffer
}

/** 한 묶음이 실제로 보낼 것들. */
export interface SelectedParts {
  parts: unknown[]
  /** 이 요청이 실어 보낸 조각·자료의 지도. **근거는 이 지도에 있는 것만 인정된다.** */
  index: ChunkIndex
  /** 예산에 밀려 빠진 조각을 알리는 줄. 비어 있으면 전부 실렸다. */
  notices: string[]
}

/**
 * 한 묶음이 보낼 조각을 고른다 — 파일이 앞, 글이 뒤.
 *
 * 순서를 여기서 정하는 이유는 조립과 같다. **자료의 본체는 파일이고 글은 그것을 보충한다.**
 * 지도의 삽입 순서(담당자가 고른 순서)를 그대로 따르므로, 같은 조합이면 언제나 같은 요청이
 * 만들어진다 — 실패를 재현할 수 있어야 한다.
 *
 * **예산은 묶음마다 다시 잰다.** 자료는 한 벌이지만 묶음이 읽는 조합은 저마다 다르고, 모델이
 * 한 번에 읽는 양은 요청 단위이기 때문이다.
 *
 * @param rank 골라야 할 때의 순서. 없으면 문서 순서 그대로다. 예산 안에 들면 **쓰이지 않는다** —
 *   빠짐없이 뽑는 것이 이 기능의 계약이고, 고르는 일은 버리는 것을 줄이는 수단일 뿐이다.
 */
export function selectParts(
  built: BuiltParts,
  keys: string[],
  rank?: (chunk: SourceChunk) => number,
): SelectedParts {
  const wanted = new Set(keys)
  const parts: unknown[] = []
  const notices: string[] = []
  const refOf = new Map(built.sources.map((s) => [s.key, s]))
  for (const [key, list] of built.fileParts) {
    if (!wanted.has(key)) continue
    // **파일 앞에도 자료 표시를 세운다.** 우리가 열지 않은 자료(PDF·이미지)는 조각이 없어
    // 모델이 가리킬 주소가 없는데, 그러면 그 문서에서 읽은 값에는 근거를 댈 방법이 아예
    // 없어진다. 표시가 있으면 자료 단위로 가리킬 수 있고, 대조하지 못한 근거는 '미검증'으로
    // 갈라 세운다 — 검증하지 못하는 것과 지어낸 것은 다르다.
    const ref = refOf.get(key)
    if (ref) parts.push({ text: sourceHeader(ref) })
    parts.push(...list)
  }

  // 예산은 묶음 전체에 한 번 적용한다. 자료별로 나눠 주면 작은 자료가 못 쓴 몫이 큰 자료에
  // 넘어가지 않아, 같은 총량인데도 더 많이 버려진다.
  const all: SourceChunk[] = []
  const refs: SourceRef[] = []
  for (const [key, list] of built.chunks) {
    if (!wanted.has(key) || list.length === 0) continue
    refs.push(list[0].source)
    all.push(...list)
  }
  // 이 묶음이 함께 싣는 글자 파일의 몫을 먼저 뺀다 — 예산은 요청 하나가 읽는 글자의 총량이다.
  let spent = 0
  for (const [key, bytes] of built.textFileBytes) if (wanted.has(key)) spent += bytes
  const picked = selectChunks(all, Math.max(0, MAX_TEXT_BYTES - spent), rank)

  // 고른 조각을 자료별로 되모아 자료 한 건이 글 한 덩이가 되게 한다(자료명이 앞에 한 번 선다).
  const bySource = new Map<string, SourceChunk[]>()
  for (const c of picked.kept) {
    const bucket = bySource.get(c.source.id)
    if (bucket) bucket.push(c)
    else bySource.set(c.source.id, [c])
  }
  for (const ref of refs) {
    const list = bySource.get(ref.id)
    if (!list || list.length === 0) {
      notices.push(`자료가 커서 이번 요청에는 담지 못했습니다: ${ref.name}`)
      continue
    }
    parts.push({ text: renderSource(ref, list) })
  }
  if (picked.dropped > 0) {
    notices.push(
      `자료가 모델이 한 번에 읽는 양을 넘어 조각 ${picked.dropped}개를 빼고 보냈습니다. 읽을 자료를 줄이면 더 정확해집니다.`,
    )
  }

  // 지도에는 **실제로 실린 것만** 담는다. 빠진 조각을 담으면 모델이 보지도 못한 자리를
  // 근거로 인정하게 된다.
  const sent = built.sources.filter((s) => wanted.has(s.key) && (bySource.has(s.id) || !s.verifiable))
  return { parts, index: buildIndex(sent, picked.kept), notices }
}

const tooLarge = (): SourceError => ({
  code: 'too_large',
  message: `선택한 자료의 합이 너무 큽니다(${mb(MAX_TOTAL_BYTES)} 이하).`,
  status: 413,
})

const encoder = new TextEncoder()
const chunksBytes = (chunks: ExtractChunk[]): number =>
  chunks.reduce((sum, c) => sum + encoder.encode(c.text).length, 0)

/**
 * 자료를 손에 쥐고 조각으로 세운다.
 *
 * @param uploaded 올린 자료를 담아 둘 그릇. **호출자가 소유한다** — 돌려주는 값에 실으면
 *   업로드 도중 시간이 초과돼 예외로 빠져나갈 때 지울 목록이 함께 사라져, 이미 올라간 기밀
 *   자료가 구글의 48시간 자동 삭제까지 남는다. 지우는 쪽이 목록을 쥐고 있어야 한다.
 */
export async function buildParts(
  sources: ResolvedSource[],
  deps: BuildDeps,
  uploaded: UploadedFile[],
): Promise<BuiltParts | { error: SourceError }> {
  const files: FileItem[] = []
  const chunks = new Map<string, SourceChunk[]>()
  const textFileBytes = new Map<string, number>()
  const refs: SourceRef[] = []
  const notices: string[] = []
  let used = 0
  /** 손에 들고 있는 조각 글자의 몫. 요청 예산이 아니라 메모리 한계선이다(limits.ts). */
  let chunkUsed = 0
  /** 글자 파일이 쓴 몫. 이쪽은 조각이 아니라 통째로 실리므로 **요청 예산**을 그대로 잰다. */
  let textFileUsed = 0

  /** 조각으로 세운 자료를 등록한다. 등록된 자료만 근거가 가리킬 수 있다. */
  const addChunks = (ref: SourceRef, list: ExtractChunk[]): boolean => {
    const size = chunksBytes(list)
    if (chunkUsed + size > MAX_COLLECT_TEXT_BYTES) return false
    chunkUsed += size
    used += size
    ref.verifiable = true
    chunks.set(ref.key, toSourceChunks(ref, list))
    refs.push(ref)
    return true
  }

  // 1) 자료를 실제로 가져오며 조각으로 세운다 -------------------------------------
  for (const [i, s] of sources.entries()) {
    const ref: SourceRef = {
      id: sourceId(i),
      key: s.key,
      name: s.name,
      attachmentId: s.attachmentId,
      // 종류는 파일명이 답한다. 링크는 주소의 마지막 마디를 본다.
      kind: classifySourceKind(s.url ?? s.name),
      verifiable: false,
    }

    // 분석 단계가 이미 연 자료는 여기서 끝난다. 원본을 만지지 않으므로 스토리지 왕복도,
    // 업로드도, 지우기도 없다 — 그것이 캐시를 둔 이유다.
    const pre = deps.extracts?.get(s.key)
    if (pre !== undefined) {
      if (!addChunks(ref, pre)) notices.push(`앞선 자료로 용량을 다 써서 건너뛰었습니다: ${s.name}`)
      continue
    }

    if (s.url) {
      // 링크는 바깥으로 나가는 일이라 시간을 먹는다. 남은 시간이 없으면 여기서 멈추고
      // 지금까지 읽은 것으로 초안을 만든다 — 다 읽으려다 아무것도 못 돌려주는 것보다 낫다.
      if (Date.now() >= deps.deadline) {
        notices.push(`시간이 모자라 읽지 못했습니다: ${s.url}`)
        continue
      }
      const read = await deps.readLink(s.url, MAX_TOTAL_BYTES - used)
      if ('message' in read) {
        notices.push(read.message)
        continue
      }
      if (read.truncated) notices.push(`본문이 길어 앞부분만 읽었습니다: ${s.url}`)
      // 남은 예산을 넘겨 오면 그 건만 버린다. 예산을 알려 주고도 다시 재는 이유는 넘긴 값이
      // 지켜졌는지를 이쪽에서 확인할 수 없기 때문이다 — 관문이 스스로 닫히지 않으면 관문이 아니다.
      // 링크는 통째 실패로 만들지 않는다(파일과 달리 담당자가 고를 때 크기를 알 수 없었다).
      const size = read.text != null ? encoder.encode(read.text).length : (read.bytes?.byteLength ?? 0)
      if (used + size > MAX_TOTAL_BYTES) {
        notices.push(`앞선 자료로 용량을 다 써서 건너뛰었습니다: ${s.url}`)
        continue
      }
      if (read.text != null) {
        // **링크 본문도 도막으로 나눈다.** 통째 조각 하나로 두면 그 조각이 예산보다 클 때
        // 쪼갤 수가 없어 자료가 통째로 빠진다 — 조각을 둔 이유가 사라지는 자리다.
        const list = textChunks(read.text, read.mime).map((c) => ({ ...c, kind: 'link' as const }))
        if (list.length === 0) {
          notices.push(`읽을 글자가 없습니다: ${s.url}`)
        } else if (!addChunks(ref, list)) {
          notices.push(`앞선 자료로 용량을 다 써서 건너뛰었습니다: ${s.url}`)
        }
        continue
      }
      if (read.bytes) {
        used += size
        files.push({ key: s.key, name: s.url, mime: read.mime, bytes: read.bytes })
        refs.push(ref)
      }
      continue
    }

    let buf = s.data
    if (!buf && s.storagePath) buf = await deps.download(s.storagePath)
    if (!buf || !s.mime) {
      return { error: { code: 'read_failed', message: '자료를 읽지 못했습니다.', status: 500 } }
    }
    used += buf.byteLength
    // 파일은 예비 검사를 이미 지났지만 링크가 앞서 예산을 먹었을 수 있다.
    if (used > MAX_TOTAL_BYTES) return { error: tooLarge() }

    // 오피스 파일은 모델이 받지 않는다. 여기서 압축을 풀어 조각으로 바꿔 넘긴다.
    // **읽기 실패는 통째 실패로 만들지 않는다** — 암호가 걸렸거나 그림뿐인 문서는 담당자가
    // 고를 때 알 수 없었던 사정이고, 그 한 건 때문에 나머지를 못 읽을 이유가 없다.
    if (isOfficeMime(s.mime)) {
      const read = await officeChunks(buf, s.mime, s.name)
      if (!Array.isArray(read)) {
        notices.push(read.message)
        continue
      }
      // 예산은 파일 크기가 아니라 **뽑아 낸 글자**로 센다. 모델이 읽는 것이 그것이고,
      // 압축된 원본 크기는 그 양을 말해 주지 않는다(엑셀은 몇 배로 부푼다).
      if (!addChunks(ref, read)) notices.push(`앞선 자료로 용량을 다 써서 건너뛰었습니다: ${s.name}`)
      continue
    }

    if (isTextOnlyMime(s.mime)) {
      textFileUsed += buf.byteLength
      // 파일은 링크와 달리 담당자가 고를 때 크기를 알 수 있었으므로 건너뛰지 않고 답한다 —
      // 무엇을 빼야 하는지 말해 주지 않으면 같은 조합으로 계속 다시 시도하게 된다.
      if (textFileUsed > MAX_TEXT_BYTES) {
        return {
          error: {
            code: 'too_large',
            message: `글자 자료(텍스트·CSV 등)의 합이 ${mb(MAX_TEXT_BYTES)}를 넘습니다. 같은 크기라도 글자는 PDF보다 훨씬 많은 양이 담겨 모델이 한 번에 읽지 못합니다.`,
            status: 413,
          },
        }
      }
      textFileBytes.set(s.key, buf.byteLength)
    }
    files.push({ key: s.key, name: s.name, mime: s.mime, bytes: buf })
    refs.push(ref)
  }

  // 2) 합계와 요청 수가 보내는 방식을 정한다 --------------------------------------
  // 요청이 둘 이상이면 크기와 무관하게 올린다(BuildDeps.forceFilesApi 주석 참조).
  const fileBytes = files.reduce((sum, f) => sum + f.bytes.byteLength, 0)
  const fileParts = new Map<string, unknown[]>()

  if (!deps.forceFilesApi && fileBytes <= MAX_INLINE_BYTES) {
    for (const f of files) {
      fileParts.set(f.key, [{ inlineData: { mimeType: f.mime, data: toBase64(f.bytes) } }])
    }
  } else {
    // 올리는 일은 바깥으로 나가는 왕복이라 건수만큼 시간을 먹는다. 몇 개씩 함께 보내되
    // 상한을 둔다 — 열 건을 한꺼번에 올리면 요율 제한에 걸려 오히려 느려진다.
    const ups = await runPool(files, UPLOAD_CONCURRENCY, async (f) => {
      const up = await uploadFile(deps.apiKey, f.bytes, f.mime, f.name, deps.signal)
      if ('message' in up) return { f, error: up.message }
      // **올린 즉시 지울 목록에 넣는다.** 이 뒤의 어느 단계에서 예외로 빠져나가도 지울
      // 대상이 남아 있어야 한다(그릇을 호출자가 쥐는 것과 같은 이유).
      uploaded.push(up)
      if (!(await waitActive(deps.apiKey, up, deps.signal))) {
        return { f, error: `자료 처리가 끝나지 않아 건너뛰었습니다: ${f.name}` }
      }
      return { f, up }
    })

    // **시간이 초과된 것은 건너뛸 일이 아니라 멈출 일이다.** 상한을 넘긴 뒤에도 계속하면
    // 남은 시간을 모델이 아니라 실패할 요청에 쓰고, 담당자는 "왜 부실한 초안인지"가 아니라
    // 뒤늦은 시간 초과를 받는다. 올린 것은 이미 그릇에 담겨 있어 정리는 그대로 돈다.
    for (const r of ups) {
      if (r.status === 'rejected' && r.reason instanceof DOMException && r.reason.name === 'AbortError') {
        throw r.reason
      }
    }

    // 결과는 넣은 순서로 돌아온다. 지도의 삽입 순서가 곧 조각의 순서라, 먼저 끝난 순서가
    // 아니라 담당자가 고른 순서로 넣어야 같은 조합이 언제나 같은 요청이 된다.
    for (const r of ups) {
      if (r.status === 'rejected') {
        console.error('[ai-fill] 업로드 예외', r.reason instanceof Error ? r.reason.message : r.reason)
        continue
      }
      const { f, up, error } = r.value as { f: FileItem; up?: UploadedFile; error?: string }
      if (error || !up) {
        notices.push(error ?? `자료를 올리지 못했습니다: ${f.name}`)
        continue
      }
      fileParts.set(f.key, [{ fileData: { mimeType: up.mime, fileUri: up.uri } }])
    }
  }

  // 올리지 못한 자료는 이번 요청에 실리지 않으므로 근거가 가리킬 대상도 아니다.
  const sent = refs.filter((r) => chunks.has(r.key) || fileParts.has(r.key))
  return { fileParts, chunks, textFileBytes, sources: sent, notices }
}
