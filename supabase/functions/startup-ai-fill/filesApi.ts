// [AI 작성하기] 큰 자료는 요청에 싣지 않고 먼저 올린 뒤 주소만 참조한다.
//
// 인라인 전송은 한 요청 20MB가 벽이고, 문자로 바꿔 싣느라 1.33배로 부풀어 실제로는 14MB가
// 끝이다. 사업계획서·IR 자료·재무제표를 함께 읽히면 금세 걸린다. Files API는 자료를 먼저
// 올려 두고 `fileData`로 가리키므로 그 벽이 사라진다.
//
// **올린 자료는 쓰자마자 지운다.** 구글이 48시간 뒤 자동으로 지우지만, 기업의 기밀 자료를
// 우리가 필요한 시간보다 오래 남겨 둘 이유가 없다 — 인라인이 아무것도 남기지 않는다는 성질을
// 이 경로에서도 최대한 지킨다. 지우기 실패는 실행을 멈추지 않는다(자동 삭제가 뒤를 받치고,
// 이미 만들어진 초안을 버릴 이유가 되지는 않는다).
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8.3

import { DELETE_TIMEOUT_MS } from './limits.ts'

const BASE = 'https://generativelanguage.googleapis.com'
/** 올린 자료가 쓸 수 있는 상태가 되기를 기다리는 한도. */
const ACTIVE_TIMEOUT_MS = 60_000
const POLL_MS = 800

export interface UploadedFile {
  /** `files/xxxx` — 지울 때 쓰는 이름. */
  name: string
  /** generateContent의 `fileData.fileUri`. */
  uri: string
  mime: string
}

/** 자료 하나를 올린다. 실패는 사람이 읽을 문구로 돌려준다(어느 자료가 빠졌는지 말해야 한다). */
export async function uploadFile(
  apiKey: string,
  bytes: ArrayBuffer,
  mime: string,
  displayName: string,
  signal: AbortSignal,
): Promise<UploadedFile | { message: string }> {
  const failed = { message: `자료를 올리지 못했습니다: ${displayName}` }

  // 1) 시작 — 이 자료를 받을 주소를 응답 헤더로 받는다.
  const start = await fetch(`${BASE}/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    signal,
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.byteLength),
      'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  })
  if (!start.ok) {
    const detail = await start.text().catch(() => '')
    console.error('[startup-ai-fill] 업로드 시작 실패', start.status, detail.slice(0, 300))
    return failed
  }
  const uploadUrl = start.headers.get('x-goog-upload-url')
  await start.body?.cancel()
  if (!uploadUrl) {
    console.error('[startup-ai-fill] 업로드 주소가 오지 않았습니다')
    return failed
  }

  // 2) 본체를 한 번에 올리고 끝낸다(이어올리기를 쓰지 않는다 — 한 번의 초안 작성 안에서
  //    끝나는 일이라 중단 지점을 기억해 둘 자리가 없다).
  const done = await fetch(uploadUrl, {
    method: 'POST',
    signal,
    // Content-Length는 넣지 않는다 — fetch가 금지 헤더로 보아 무시하거나 거절하고,
    // 어차피 본문에서 스스로 채운다. 길이는 위 시작 요청에서 이미 알렸다.
    headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: bytes,
  })
  if (!done.ok) {
    const detail = await done.text().catch(() => '')
    console.error('[startup-ai-fill] 업로드 실패', done.status, detail.slice(0, 300))
    return failed
  }
  const body = (await done.json().catch(() => null)) as { file?: { name?: string; uri?: string; mimeType?: string } } | null
  const f = body?.file
  if (!f?.name || !f?.uri) {
    console.error('[startup-ai-fill] 업로드 응답에 주소가 없습니다')
    return failed
  }
  return { name: f.name, uri: f.uri, mime: f.mimeType ?? mime }
}

/**
 * 올린 자료가 쓸 수 있는 상태가 될 때까지 기다린다.
 *
 * 문서·이미지는 대개 즉시 준비되지만 큰 PDF는 잠시 처리 중일 수 있다. 준비되기 전에
 * 참조하면 모델이 400으로 거절하므로, 여기서 기다리지 않으면 큰 자료일수록 더 자주 실패한다.
 */
export async function waitActive(apiKey: string, file: UploadedFile, signal: AbortSignal): Promise<boolean> {
  const url = `${BASE}/v1beta/${file.name}?key=${encodeURIComponent(apiKey)}`
  const deadline = Date.now() + ACTIVE_TIMEOUT_MS
  for (;;) {
    const resp = await fetch(url, { signal })
    if (!resp.ok) {
      await resp.body?.cancel()
      return false
    }
    const state = ((await resp.json().catch(() => null)) as { state?: string } | null)?.state
    if (state === 'ACTIVE') return true
    if (state === 'FAILED') return false
    if (Date.now() >= deadline) return false
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}

/**
 * 올린 자료를 지운다. 실패해도 조용히 넘어간다(48시간 자동 삭제가 뒤를 받친다).
 *
 * **본 요청의 `signal`을 쓰지 않는다.** 지우기가 도는 시점은 대개 그 타이머가 이미 끊긴
 * 뒤(`finally`)라, 같은 신호를 물리면 지우기가 시작하자마자 취소된다 — 정리하려고 둔 자리가
 * 정리를 못 하는 자리가 된다. 대신 자기 시계를 갖는다.
 *
 * **지우기가 응답을 붙잡지 않게** 짧은 상한을 둔다. 이미 만들어진 초안이 손에 있는데 정리가
 * 늦어져 담당자가 시간 초과를 받으면, 지우기의 목적을 지키려다 그 초안을 잃는다.
 */
export async function deleteFile(apiKey: string, file: UploadedFile): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DELETE_TIMEOUT_MS)
  try {
    const resp = await fetch(`${BASE}/v1beta/${file.name}?key=${encodeURIComponent(apiKey)}`, {
      method: 'DELETE',
      signal: controller.signal,
    })
    await resp.body?.cancel()
    if (!resp.ok) console.error('[startup-ai-fill] 올린 자료 삭제 실패', file.name, resp.status)
  } catch (e) {
    console.error('[startup-ai-fill] 올린 자료 삭제 실패', file.name, e instanceof Error ? e.message : e)
  } finally {
    clearTimeout(timer)
  }
}
