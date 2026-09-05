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
// Deno API를 쓰지 않는다(works vitest가 검증 규칙을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8.2·§9

import { resolveMime, SUPPORTED_HINT } from './formats.ts'

/** 인라인 합산 상한 14MB — base64 팽창(약 1.33배) 후에도 모델 요청 한도 안에 든다. */
export const MAX_TOTAL_BYTES = 14 * 1024 * 1024
/** 한 번에 읽을 자료 수. 입력 토큰을 억제한다. */
export const MAX_FILES = 5

/** 읽을 자료 한 건. */
export interface ResolvedSource {
  /** 감사 로그가 가리킬 첨부 행 id. 등록 모드 업로드는 가리킬 행이 없어 null이다. */
  attachmentId: string | null
  name: string
  /**
   * 상한 계산에 쓰는 크기. **링크는 0이다** — 가져오기 전에는 얼마나 될지 알 수 없다.
   * 대신 linkRead가 한 건당 자기 상한(4MB)으로 막는다.
   */
  byteSize: number
  /** 첨부의 스토리지 경로(그 외는 null). */
  storagePath: string | null
  /** 이미 손에 있는 바이트(등록 모드 업로드). 첨부·링크는 index가 뒤에 채운다. */
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

/** 이 자료를 모델이 읽을 수 있는가. 판정과 보낼 MIME은 formats.ts가 소유한다. */
export function isReadable(contentType: string | null | undefined, fileName: string): boolean {
  return resolveMime(contentType, fileName) !== null
}

const unsupported = (names: string[]): SourceError => ({
  code: 'unsupported_type',
  // 무엇이 걸렸는지 이름으로 말한다 — 다섯 개를 골랐을 때 "형식이 안 된다"만으로는
  // 어느 것을 빼야 하는지 알 수 없다.
  message: `읽을 수 없는 형식입니다: ${names.join(' · ')}. 지원 형식은 ${SUPPORTED_HINT}입니다.`,
  status: 415,
})

/**
 * 개수·합산 크기를 본다. 화면도 같은 값으로 잠그지만 여기서 다시 막는 이유는 UI 숨김이
 * 보안이 아니기 때문이다 — 함수는 직접 호출될 수 있다.
 */
export function validateSources(sources: ResolvedSource[]): SourceError | null {
  if (sources.length === 0) {
    return { code: 'invalid_request', message: '읽을 자료를 선택해야 합니다.', status: 400 }
  }
  if (sources.length > MAX_FILES) {
    return { code: 'invalid_request', message: `자료는 한 번에 ${MAX_FILES}개까지 읽을 수 있습니다.`, status: 400 }
  }
  const total = sources.reduce((sum, s) => sum + s.byteSize, 0)
  if (total > MAX_TOTAL_BYTES) {
    return { code: 'too_large', message: '선택한 자료의 합이 너무 큽니다(14MB 이하).', status: 413 }
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
): Promise<{ sources: ResolvedSource[] } | { error: SourceError }> {
  const bad = files.filter((f) => !isReadable(f.type, f.name))
  if (bad.length > 0) return { error: unsupported(bad.map((f) => f.name)) }

  // 합산 상한 검사보다 먼저 바이트를 읽지 않도록 크기부터 본다(큰 파일을 메모리에 올리지 않는다).
  const pre = validateSources(
    files.map((f) => ({
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
  for (const f of files) {
    sources.push({
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
 * 등록 모드의 링크: 주소만 온다. 내용은 index가 linkRead로 가져온다.
 *
 * 등록 모드에서 링크를 원장에 먼저 넣지 않는 이유는 파일과 같다 — 대상 레코드가 없어 넣을
 * 자리가 없고, 등록을 취소하면 남아서도 안 된다.
 */
export function resolvePendingLinks(urls: string[]): ResolvedSource[] {
  return urls.map((url) => ({
    attachmentId: null,
    name: url,
    byteSize: 0,
    storagePath: null,
    data: null,
    mime: null,
    url,
  }))
}
