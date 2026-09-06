// [AI 작성하기] 읽을 자료의 세 경로 — 올라간 첨부 · 아직 안 올라간 파일 · 바깥 링크.
//
// 경로가 여럿인 이유는 폼이 등록과 수정을 함께 쓰고, 자료 관리가 파일과 링크를 함께 담기
// 때문이다.
//   * **수정 모드의 파일**: 이미 `attachments` 행이라 id로 가리킨다(그래야 RLS가 그 행을 볼
//     자격을 판정한다).
//   * **등록 모드의 파일**: 대상 레코드가 없어 업로드할 수 없으므로 브라우저 메모리에만 있다
//     (pendingMaterials). 그래서 파일 자체가 요청에 실린다.
//   * **링크**: 두 모드 모두 주소만 온다. 내용은 서버가 가져온다(linkRead.ts) — 무엇을 읽었는지
//     우리가 알아야 하고, 사설망으로 향하는 주소를 우리가 막아야 하기 때문이다.
//
// 자격을 묻는 대상도 갈린다. 첨부는 "그 행을 볼 수 있는가"(RLS)와 "그 기업을 고칠 수 있는가"를
// 함께 묻고, 업로드·링크는 가리킬 행이 없으므로 모드의 쓰기 자격만 묻는다. 판정 자체는
// index.ts가 하고 여기서는 무엇을 읽을지만 모은다.
//
// **여기의 크기 검사는 예비 검사다.** 링크는 가져오기 전에 크기를 알 수 없어 0으로 잡히므로,
// 진짜 예산은 자료를 손에 쥔 뒤 parts.ts가 다시 센다. 그래도 여기서 먼저 막는 이유는 큰
// 파일을 내려받기 전에 끊기 위해서다.
//
// Deno API를 쓰지 않는다(works vitest가 검증 규칙을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8.2·§9

import { resolveMime, SUPPORTED_HINT } from './formats.ts'
import { MAX_SINGLE_BYTES, MAX_TOTAL_BYTES, mb } from './limits.ts'

export { MAX_TOTAL_BYTES }

/** 읽을 자료 한 건. */
export interface ResolvedSource {
  /**
   * 화면의 격자가 이 자료를 가리키는 키.
   *
   * 카드별 자료 배정이 이 키로 온다. **첨부 id를 그대로 쓰지 못하는 이유는 등록 모드**다 —
   * 아직 원장에 없는 파일·링크에는 id가 없어 가리킬 말이 없다. 그래서 화면이 만든 키를
   * 그대로 물려받는다(첨부는 id, 보류 파일은 브라우저가 File 실물에 붙인 안정 키, 링크는
   * `link:주소`).
   */
  key: string
  /** 감사 로그가 가리킬 첨부 행 id. 등록 모드 업로드는 가리킬 행이 없어 null이다. */
  attachmentId: string | null
  name: string
  /**
   * 예비 검사에 쓰는 크기. **링크는 0이다** — 가져오기 전에는 얼마나 될지 알 수 없다.
   * 링크의 실제 크기는 parts.ts가 남은 예산으로 막는다.
   */
  byteSize: number
  /** 첨부의 스토리지 경로(그 외는 null). */
  storagePath: string | null
  /** 이미 손에 있는 바이트(등록 모드 업로드). 첨부·링크는 parts가 뒤에 채운다. */
  data: ArrayBuffer | null
  /** 모델에 보낼 MIME. 링크는 내용을 받아 본 뒤에야 정해지므로 그때까지 null이다. */
  mime: string | null
  /** LINK 자료의 주소(파일은 null). */
  url: string | null
}

export type SourceError =
  | { code: 'invalid_request'; message: string; status: 400 }
  | { code: 'unsupported_type'; message: string; status: 415 }
  | { code: 'too_large'; message: string; status: 413 }
  | { code: 'read_failed'; message: string; status: 500 }

/** 이 자료를 모델이 읽을 수 있는가. 판정과 보낼 MIME은 formats.ts가 소유한다. */
export function isReadable(contentType: string | null | undefined, fileName: string): boolean {
  return resolveMime(contentType, fileName) !== null
}

const unsupported = (names: string[]): SourceError => ({
  code: 'unsupported_type',
  // 무엇이 걸렸는지 이름으로 말한다 — 여러 개를 골랐을 때 "형식이 안 된다"만으로는
  // 어느 것을 빼야 하는지 알 수 없다.
  message: `읽을 수 없는 형식입니다: ${names.join(' · ')}. 지원 형식은 ${SUPPORTED_HINT}입니다.`,
  status: 415,
})

/**
 * 크기의 예비 검사. 화면도 같은 값으로 잠그지만 여기서 다시 막는 이유는 UI 숨김이
 * 보안이 아니기 때문이다 — 함수는 직접 호출될 수 있다.
 *
 * **개수는 막지 않는다.** 합계 안에서만 이뤄지면 몇 건인지는 물어볼 일이 아니다 — 종전의
 * '5개까지'는 크기를 재는 자가 링크를 세지 못하던 시절에 그 자리를 대신하던 울타리였다.
 * 개수가 함께 막고 있던 나머지 둘(글자 계열의 밀도 · 링크에 드는 시간)은 조립이 제 이름으로
 * 막는다(parts.ts).
 */
export function validateSources(sources: ResolvedSource[]): SourceError | null {
  if (sources.length === 0) {
    return { code: 'invalid_request', message: '읽을 자료를 선택해야 합니다.', status: 400 }
  }
  // 한 건 상한을 합산보다 먼저 본다 — 합계만 보면 "합은 되는데 한 파일이 전부"인 경우를
  // 통과시키고, 그때는 나머지 자료가 모델에 닿지 못한 채 초안만 부실해진다.
  const big = sources.filter((s) => s.byteSize > MAX_SINGLE_BYTES)
  if (big.length > 0) {
    return {
      code: 'too_large',
      message: `한 건이 너무 큽니다(${mb(MAX_SINGLE_BYTES)} 이하): ${big.map((s) => s.name).join(' · ')}`,
      status: 413,
    }
  }
  const total = sources.reduce((sum, s) => sum + s.byteSize, 0)
  if (total > MAX_TOTAL_BYTES) {
    return { code: 'too_large', message: `선택한 자료의 합이 너무 큽니다(${mb(MAX_TOTAL_BYTES)} 이하).`, status: 413 }
  }
  return null
}

/** `attachments` 행 하나의 필요한 부분만. */
export interface AttachmentRow {
  id: string
  file_name: string
  kind: 'FILE' | 'LINK'
  url: string | null
  storage_path: string | null
  content_type: string | null
  byte_size: number | null
}

/**
 * 수정 모드: 이미 올라간 자료를 가리킨다(파일과 링크 모두).
 *
 * 호출자 토큰으로 조회한 결과를 받으므로 여기 도착한 행은 이미 RLS를 통과한 것이다.
 * **요청한 id 수와 다르면 전체를 거부한다** — 남의 것·없는 것이 하나라도 섞이면 부분 처리는
 * 무엇을 읽었는지를 흐린다.
 */
export function resolveAttachments(
  rows: AttachmentRow[],
  requestedIds: string[],
): { sources: ResolvedSource[] } | { error: SourceError } {
  if (rows.length !== requestedIds.length) {
    return { error: { code: 'invalid_request', message: '선택한 자료를 찾을 수 없습니다.', status: 400 } }
  }
  // 링크는 형식을 미리 볼 수 없다(가져와 봐야 안다). 파일만 여기서 거른다.
  const bad = rows.filter((r) => r.kind === 'FILE' && !isReadable(r.content_type, r.file_name))
  if (bad.length > 0) return { error: unsupported(bad.map((r) => r.file_name)) }

  return {
    sources: rows.map((r) => ({
      // 이미 원장에 있는 자료는 id가 곧 화면의 키다(화면도 `m.id`를 키로 쓴다).
      key: r.id,
      attachmentId: r.id,
      name: r.file_name,
      byteSize: r.kind === 'LINK' ? 0 : Number(r.byte_size ?? 0),
      storagePath: r.kind === 'LINK' ? null : r.storage_path,
      data: null,
      mime: r.kind === 'LINK' ? null : resolveMime(r.content_type, r.file_name),
      url: r.kind === 'LINK' ? r.url : null,
    })),
  }
}

/**
 * 등록 모드: 아직 원장에 없는 파일이 요청에 실려 온다.
 *
 * 여기서 받은 파일은 **어디에도 저장하지 않는다.** 초안을 만들고 버린다 — 등록을 취소하면
 * 고아 파일이 남지 않아야 하고, 그 규칙은 pendingMaterials가 선업로드를 택하지 않은 이유와
 * 같다. 실제 업로드는 저장이 성공해 id가 생긴 뒤 폼이 한다.
 */
export async function resolveUploads(
  files: File[],
  keys: string[] = [],
): Promise<{ sources: ResolvedSource[] } | { error: SourceError }> {
  const bad = files.filter((f) => !isReadable(f.type, f.name))
  if (bad.length > 0) return { error: unsupported(bad.map((f) => f.name)) }

  // 화면이 보낸 안정 키를 순서대로 물려받는다. 순번을 여기서 다시 세지 않는 이유는 담당자가
  // 자료를 골라 보내면 화면의 File 실물과 어긋나기 때문이다 — 어긋나면 카드별 배정이
  // 엉뚱한 자료를 가리킨다. 키가 오지 않으면(격자 이전 화면) 호환용 이름으로 세운다.
  const keyOf = (f: File, i: number) => keys[i] ?? `file:${i}:${f.name}`

  // 크기 검사보다 먼저 바이트를 읽지 않도록 크기부터 본다(큰 파일을 메모리에 올리지 않는다).
  const pre = validateSources(
    files.map((f, i) => ({
      key: keyOf(f, i),
      attachmentId: null,
      name: f.name,
      byteSize: f.size,
      storagePath: null,
      data: null,
      mime: resolveMime(f.type, f.name),
      url: null,
    })),
  )
  if (pre) return { error: pre }

  const sources: ResolvedSource[] = []
  for (const [i, f] of files.entries()) {
    sources.push({
      key: keyOf(f, i),
      attachmentId: null,
      name: f.name,
      byteSize: f.size,
      storagePath: null,
      data: await f.arrayBuffer(),
      mime: resolveMime(f.type, f.name),
      url: null,
    })
  }
  return { sources }
}

/**
 * 등록 모드의 링크: 주소만 온다. 내용은 parts가 linkRead로 가져온다.
 *
 * 등록 모드에서 링크를 원장에 먼저 넣지 않는 이유는 파일과 같다 — 대상 레코드가 없어 넣을
 * 자리가 없고, 등록을 취소하면 남아서도 안 된다.
 */
export function resolvePendingLinks(urls: string[]): ResolvedSource[] {
  return urls.map((url) => ({
    // 주소가 곧 키다(화면도 `link:주소`를 키로 쓴다). 같은 주소를 두 번 담을 수 없으므로
    // 순번이 필요 없고, 그래서 파일과 달리 양쪽이 따로 만들어도 같은 값이 나온다.
    key: `link:${url}`,
    attachmentId: null,
    name: url,
    byteSize: 0,
    storagePath: null,
    data: null,
    mime: null,
    url,
  }))
}
