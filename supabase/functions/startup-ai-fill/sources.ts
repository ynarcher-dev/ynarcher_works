// [AI 작성하기] 읽을 자료의 두 경로 — 이미 올라간 첨부와, 아직 올라가지 않은 파일.
//
// 경로가 둘인 이유는 폼이 등록과 수정을 함께 쓰기 때문이다. **수정 모드**의 자료는 이미
// `attachments` 행이라 id로 가리키면 되고(그래야 RLS가 그 행을 볼 자격을 판정한다),
// **등록 모드**의 자료는 아직 원장에 없다 — 대상 레코드가 없어 업로드할 수 없으므로 브라우저
// 메모리에만 있다(pendingMaterials). 그래서 그때는 파일 자체가 올라온다.
//
// 두 경로는 **자격을 묻는 대상이 다르다**. 첨부는 "그 행을 볼 수 있는가"(RLS)와 "그 기업을
// 고칠 수 있는가"를 함께 묻고, 업로드는 가리킬 행이 없으므로 "스타트업을 만들 수 있는가"만
// 묻는다. 판정 자체는 index.ts가 하고 여기서는 무엇을 읽을지만 모은다.
//
// Deno API를 쓰지 않는다(works vitest가 검증 규칙을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8.2·§9

/** 인라인 합산 상한 14MB — base64 팽창(약 1.33배) 후에도 모델 요청 한도 안에 든다. */
export const MAX_TOTAL_BYTES = 14 * 1024 * 1024
/** 한 번에 읽을 파일 수. 입력 토큰을 억제한다. */
export const MAX_FILES = 5

/** 읽을 자료 한 건. 바이트는 첨부(스토리지에서 받음)와 업로드(요청에 실려 옴) 모두 여기 담긴다. */
export interface ResolvedSource {
  /** 감사 로그가 가리킬 첨부 행 id. 등록 모드 업로드는 가리킬 행이 없어 null이다. */
  attachmentId: string | null
  name: string
  byteSize: number
  /** 첨부의 스토리지 경로(업로드는 null). */
  storagePath: string | null
  /** 업로드된 바이트(첨부는 index가 스토리지에서 받아 채운다). */
  data: ArrayBuffer | null
}

export type SourceError =
  | { code: 'invalid_request'; message: string; status: 400 }
  | { code: 'unsupported_type'; message: string; status: 415 }
  | { code: 'too_large'; message: string; status: 413 }

/** PDF만 받는다. Gemini가 네이티브로 읽는 문서 형식이고, 그 밖은 글자를 얻지 못한다. */
export function isPdf(contentType: string | null | undefined, fileName: string): boolean {
  return contentType === 'application/pdf' || /\.pdf$/i.test(fileName)
}

/**
 * 개수·형식·합산 크기를 함께 본다. 화면도 같은 값으로 잠그지만 여기서 다시 막는 이유는
 * UI 숨김이 보안이 아니기 때문이다 — 함수는 직접 호출될 수 있다.
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
  storage_path: string
  content_type: string | null
  byte_size: number | null
}

/**
 * 수정 모드: 이미 올라간 첨부를 가리킨다.
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
  const nonPdf = rows.filter((r) => !isPdf(r.content_type, r.file_name))
  if (nonPdf.length > 0) {
    return {
      error: {
        code: 'unsupported_type',
        message: 'PDF 자료만 읽을 수 있습니다. PDF로 변환해 올려 주세요.',
        status: 415,
      },
    }
  }
  return {
    sources: rows.map((r) => ({
      attachmentId: r.id,
      name: r.file_name,
      byteSize: Number(r.byte_size ?? 0),
      storagePath: r.storage_path,
      data: null,
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
  const nonPdf = files.filter((f) => !isPdf(f.type, f.name))
  if (nonPdf.length > 0) {
    return {
      error: {
        code: 'unsupported_type',
        message: 'PDF 자료만 읽을 수 있습니다. PDF로 변환해 올려 주세요.',
        status: 415,
      },
    }
  }
  // 합산 상한 검사보다 먼저 바이트를 읽지 않도록 크기부터 본다(큰 파일을 메모리에 올리지 않는다).
  const pre = validateSources(
    files.map((f) => ({ attachmentId: null, name: f.name, byteSize: f.size, storagePath: null, data: null })),
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
    })
  }
  return { sources }
}
