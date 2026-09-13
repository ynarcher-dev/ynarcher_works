/**
 * 파일받기(FILE_COLLECTION) — GUEST 쪽 통신 서비스.
 *
 * React도 Supabase 타입도 들이지 않는다. 바깥과 닿는 네 가지 동작(파일 입출구 Edge 호출,
 * 서명 URL 업로드, RPC, 브라우저 내려받기)을 **주입받는 배선**(`FileCollectionGateway`)으로
 * 두고, 여기서는 순서와 실패 처리만 정한다 — 그래야 "서명 → 업로드 → 확정"의 순서와
 * "업로드가 실패하면 확정하지 않는다"는 규칙을 실제 호출로 시험할 수 있다.
 *
 * 되돌리지 말 것 넷:
 * - **업로드 성공 전에는 확정(commit)하지 않는다.** 확정은 실물이 올라갔다는 신고가 아니라
 *   서버가 실물을 확인하는 자리이고, 건너뛰면 원장에만 줄이 남는다.
 * - **파일 하나의 실패를 다른 파일의 성공에 묶지 않는다.** 여러 개를 한 번에 고르더라도
 *   결과는 파일마다 따로 돌려주며, 실패한 것은 실패로 남긴다.
 * - **자동 재시도를 걸지 않는다.** 서명은 회차마다 새 경로를 만들므로, 조용한 재시도는
 *   같은 파일을 여러 줄로 남긴다. 다시 하는 일은 사람이 고른다.
 * - **맥락이 바뀌면 그 자리에서 멈춘다.** 업로드 중 계정·사업이 갈리면 남은 확정을 보내지
 *   않는다(보낸다면 새 세션의 권한으로 옛 화면의 일을 끝내는 셈이다).
 * - **배선이 던져도 결과는 파일마다 남는다.** 주입받은 호출이 약속을 깨고 예외를 던지더라도
 *   그 파일 하나만 실패로 적고 다음 파일로 넘어간다 — 앞서 끝난 성공까지 잃지 않는다.
 *
 * 계약: supabase/functions/file-collection-file/handler.ts, 20260913210500_file_collection_schema.sql
 */

import type { FileCollectionStatus } from '@ynarcher/master-data'

/** 파일 입출구 Edge Function 이름. 업로드 서명·확정·다운로드가 한 주소를 쓴다. */
export const FILE_ENDPOINT = 'file-collection-file'

/** 실물 상한(100MB). DB·Storage·Edge가 같은 값을 본다. */
export const MAX_UPLOAD_BYTES = 104857600
/** 원장의 `original_name` 상한. */
export const MAX_FILE_NAME_LENGTH = 255
/** 브라우저가 형식을 모를 때의 값. 빈 문자열로 서명하면 업로드가 형식 없이 올라간다. */
export const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

// ---------------------------------------------------------------------------
// 배선(주입 지점)
// ---------------------------------------------------------------------------

/** Edge 응답 한 겹. 실패 본문에 `fileId`가 실려 오면(서명 실패) 그대로 살려 둔다. */
export interface FileEndpointResult<T> {
  ok: boolean
  data: T | null
  error: { error?: string; message?: string; fileId?: string } | null
}

export interface SignedUpload {
  fileId: string
  bucket: string
  path: string
  token: string
  signedUrl: string
}

/** 업로드 후보 — 브라우저의 `File`이 그대로 들어맞는 최소 모양(테스트는 평범한 객체를 쓴다). */
export interface UploadCandidate {
  name: string
  size: number
  type: string
}

export interface FileCollectionGateway {
  /** `file-collection-file` 호출(sign·commit·download). */
  invokeFile: <T>(body: Record<string, unknown>) => Promise<FileEndpointResult<T>>
  /** 서명받은 주소로의 실제 업로드. */
  uploadToSignedUrl: (input: {
    bucket: string
    path: string
    token: string
    file: unknown
    contentType: string
  }) => Promise<{ error: unknown }>
  /** 파일받기 RPC(제출·코멘트·파일 내리기). */
  rpc: <T>(fn: string, args: Record<string, unknown>) => Promise<{ data: T | null; error: unknown }>
  /** 지금 화면의 계정·맥락이 이 작업을 시작할 때와 달라졌는가. */
  isStale: () => boolean
  /** 내려받기 실행(브라우저 앵커). */
  deliver: (url: string, fileName: string) => void
}

// ---------------------------------------------------------------------------
// 업로드
// ---------------------------------------------------------------------------

export type UploadFailureReason =
  | 'invalid_file'
  | 'sign_failed'
  | 'upload_failed'
  | 'commit_failed'
  | 'context_changed'

export type UploadOutcome =
  | { ok: true; fileName: string; fileId: string }
  | {
      ok: false
      fileName: string
      reason: UploadFailureReason
      /** 원장에 `PENDING`으로 남은 줄. 있으면 화면이 재확인·제거를 걸 수 있다. */
      fileId?: string
      message: string
    }

/**
 * 보내기 전에 화면이 먼저 거르는 조건. 서버도 같은 값을 보지만, 100MB짜리를 올려 보낸 뒤
 * 거절을 읽게 하지 않는다. **여기서 통과했다는 사실이 허가는 아니다** — 판정은 서버가 한다.
 */
export function validateUpload(
  file: UploadCandidate,
): { ok: true; contentType: string } | { ok: false; message: string } {
  if (!file.name) return { ok: false, message: '파일 이름을 읽지 못했습니다.' }
  if (file.name.length > MAX_FILE_NAME_LENGTH) {
    return { ok: false, message: `파일 이름이 너무 깁니다(${MAX_FILE_NAME_LENGTH}자 이하).` }
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, message: '빈 파일은 올릴 수 없습니다.' }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: '100MB를 넘는 파일은 올릴 수 없습니다.' }
  }
  return { ok: true, contentType: file.type || DEFAULT_CONTENT_TYPE }
}

const STALE_MESSAGE = '계정 또는 사업이 바뀌어 업로드를 멈췄습니다.'

/**
 * 배선 호출 한 번을 감싼다. 주입받은 함수가 약속(결과 객체)을 깨고 예외를 던져도 **그 단계의
 * 실패**로만 읽는다 — 예외가 위로 새면 같은 묶음의 다른 파일 결과까지 함께 사라진다.
 */
async function attempt<T>(run: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await run() }
  } catch {
    return { ok: false }
  }
}

/** `isStale`이 던지더라도 멈추는 쪽으로 읽는다(모르면 남의 맥락에 쓰지 않는다). */
function isStale(gw: FileCollectionGateway): boolean {
  try {
    return gw.isStale()
  } catch {
    return true
  }
}

/**
 * 파일 한 개의 서명 → 업로드 → 확정.
 *
 * 세 단계가 모두 성공해야 `ok`다. 중간에 끊기면 원장에는 `PENDING` 줄이 남으므로 그 `fileId`를
 * 함께 돌려준다 — 화면이 "올라가다 만 파일"을 정직하게 보여 주고 재확인·제거를 걸 수 있게 한다.
 * 단계마다 예외를 그 단계의 실패로 접으므로 **이 함수는 던지지 않는다.**
 */
export async function uploadOneFile(
  gw: FileCollectionGateway,
  input: { responseId: string; file: UploadCandidate },
): Promise<UploadOutcome> {
  const { responseId, file } = input
  const checked = validateUpload(file)
  if (!checked.ok) {
    return { ok: false, fileName: file.name, reason: 'invalid_file', message: checked.message }
  }
  if (isStale(gw)) {
    return { ok: false, fileName: file.name, reason: 'context_changed', message: STALE_MESSAGE }
  }

  const signCall = await attempt(() =>
    gw.invokeFile<SignedUpload>({
      action: 'sign',
      responseId,
      fileName: file.name,
      contentType: checked.contentType,
      byteSize: file.size,
    }),
  )
  if (!signCall.ok) {
    // 서명 호출 자체가 끊겼다. 서버가 줄을 만들었는지 알 수 없으므로 fileId를 지어내지 않는다.
    return {
      ok: false,
      fileName: file.name,
      reason: 'sign_failed',
      message: '업로드 주소를 발급받지 못했습니다.',
    }
  }
  const signed = signCall.value
  const grant = signed.data
  if (!signed.ok || !grant?.token || !grant.path || !grant.fileId) {
    return {
      ok: false,
      fileName: file.name,
      reason: 'sign_failed',
      // 서명만 실패한 경우 등록은 이미 PENDING으로 남아 있다(Edge가 fileId를 함께 준다).
      fileId: signed.error?.fileId ?? grant?.fileId,
      message: '업로드 주소를 발급받지 못했습니다.',
    }
  }

  // 주소를 받아 오는 사이에 계정·사업이 갈릴 수 있다. **실물을 올리기 전에** 멈춘다 —
  // 올리고 나서 확정만 걸러도 저장소에는 앞사람 파일이 남는다. 원장에 이미 생긴 PENDING 줄은
  // 그대로 돌려주어 화면이 그 줄을 지울 수 있게 한다.
  if (isStale(gw)) {
    return {
      ok: false,
      fileName: file.name,
      reason: 'context_changed',
      fileId: grant.fileId,
      message: STALE_MESSAGE,
    }
  }

  const uploadCall = await attempt(() =>
    gw.uploadToSignedUrl({
      bucket: grant.bucket,
      path: grant.path,
      token: grant.token,
      file,
      contentType: checked.contentType,
    }),
  )
  if (!uploadCall.ok || uploadCall.value.error) {
    return {
      ok: false,
      fileName: file.name,
      reason: 'upload_failed',
      fileId: grant.fileId,
      message: '파일을 올리지 못했습니다.',
    }
  }

  // 실물은 올라갔지만 화면이 이미 다른 계정·사업이면 확정을 보내지 않는다.
  if (isStale(gw)) {
    return {
      ok: false,
      fileName: file.name,
      reason: 'context_changed',
      fileId: grant.fileId,
      message: STALE_MESSAGE,
    }
  }

  const commitCall = await attempt(() =>
    gw.invokeFile<{ fileId: string }>({ action: 'commit', fileId: grant.fileId }),
  )
  if (!commitCall.ok || !commitCall.value.ok) {
    return {
      ok: false,
      fileName: file.name,
      reason: 'commit_failed',
      fileId: grant.fileId,
      message: '업로드를 확정하지 못했습니다. 목록에서 다시 확인해 주십시오.',
    }
  }

  return { ok: true, fileName: file.name, fileId: grant.fileId }
}

/**
 * 고른 파일을 **순서대로** 올린다(동시에 던지지 않는다 — 한 문항에 여러 줄을 만드는 일이라
 * 순서가 결과를 읽는 순서이기도 하다). 맥락이 갈리면 남은 파일은 시작하지 않는다.
 *
 * 한 파일에서 무슨 일이 생겨도 **이미 나온 결과는 잃지 않는다** — 예상 못 한 예외까지 그
 * 파일 한 줄의 실패로 접고 다음 파일로 넘어간다.
 */
export async function uploadFiles(
  gw: FileCollectionGateway,
  input: { responseId: string; files: readonly UploadCandidate[] },
): Promise<UploadOutcome[]> {
  const out: UploadOutcome[] = []
  for (const file of input.files) {
    if (isStale(gw)) {
      out.push({
        ok: false,
        fileName: file.name,
        reason: 'context_changed',
        message: STALE_MESSAGE,
      })
      continue
    }
    const one = await attempt(() => uploadOneFile(gw, { responseId: input.responseId, file }))
    out.push(
      one.ok
        ? one.value
        : {
            ok: false,
            fileName: file.name,
            reason: 'upload_failed',
            message: '알 수 없는 이유로 올리지 못했습니다. 목록에서 다시 확인해 주십시오.',
          },
    )
  }
  return out
}

/**
 * 올라가다 만 파일의 재확인. 확정만 다시 보낸다 — **서명·업로드를 되풀이하지 않는다**
 * (되풀이하면 같은 파일이 두 줄이 된다). 실물이 없으면 서버가 거절하고 줄은 그대로 남는다.
 */
export async function commitPendingFile(
  gw: FileCollectionGateway,
  fileId: string,
): Promise<{ ok: boolean; message?: string }> {
  const res = await gw.invokeFile<{ fileId: string }>({ action: 'commit', fileId })
  if (!res.ok) {
    return { ok: false, message: '업로드를 확인하지 못했습니다. 파일을 지우고 다시 올려 주십시오.' }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// RPC — 쓰기는 전부 서버 함수를 지난다(직접 DML 없음)
// ---------------------------------------------------------------------------

function rpcError(error: unknown, fallback: string): Error {
  const message = (error as { message?: string } | null)?.message
  return new Error(message || fallback)
}

/** 문항 하나의 제출. 다른 문항이 비어 있어도 이 문항만 제출된다. */
export async function submitResponse(
  gw: FileCollectionGateway,
  responseId: string,
): Promise<FileCollectionStatus> {
  const { data, error } = await gw.rpc<FileCollectionStatus>('file_collection_submit', {
    p_response_id: responseId,
  })
  if (error) throw rpcError(error, '제출하지 못했습니다.')
  return (data as FileCollectionStatus) ?? 'SUBMITTED'
}

/** 문항에 남기는 코멘트. 작성자와 작성 측(GUEST)은 서버가 적는다. */
export async function addComment(
  gw: FileCollectionGateway,
  input: { responseId: string; body: string },
): Promise<string> {
  const { data, error } = await gw.rpc<string>('file_collection_add_comment', {
    p_response_id: input.responseId,
    p_body: input.body,
  })
  if (error) throw rpcError(error, '메모를 남기지 못했습니다.')
  return (data as string) ?? ''
}

/** 파일 내리기. 본인이 올린 **현재 회차의 미제출 파일**만 서버가 받아 준다. */
export async function removeFile(gw: FileCollectionGateway, fileId: string): Promise<void> {
  const { error } = await gw.rpc('file_collection_remove_file', { p_file_id: fileId })
  if (error) throw rpcError(error, '파일을 내리지 못했습니다.')
}

/**
 * 내려받기. 서명은 화면이 만들지 않는다 — Edge가 권한을 다시 보고 접근 기록을 남긴 뒤에만
 * 60초짜리 주소를 준다(기존 첨부 다운로드와 같은 계약).
 *
 * 주소를 받아 오는 사이에 계정·사업이 갈렸으면 **내려받지 않는다**. 다음 사람의 화면에서
 * 앞사람이 고른 파일이 저장되기 시작하는 일을 만들지 않기 위해서다.
 */
export async function downloadFile(
  gw: FileCollectionGateway,
  fileId: string,
): Promise<{ delivered: boolean }> {
  const res = await gw.invokeFile<{ url: string; fileName: string }>({
    action: 'download',
    fileId,
  })
  if (!res.ok || !res.data?.url) throw new Error('파일을 내려받지 못했습니다.')
  if (isStale(gw)) return { delivered: false }
  gw.deliver(res.data.url, res.data.fileName)
  return { delivered: true }
}
