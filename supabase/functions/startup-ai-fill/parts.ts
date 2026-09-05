// [AI 작성하기] 고른 자료를 모델에 보낼 조각(parts)으로 세운다.
//
// 여기가 이 기능의 예산 관문이다. 예비 검사(sources.ts)는 **적혀 있는 크기**만 보므로 링크를
// 세지 못한다 — 가져오기 전에는 얼마나 될지 알 수 없기 때문이다. 그래서 자료를 실제로 손에
// 쥐는 이 자리에서 한 건씩 예산을 깎아 가며 다시 센다. 이 관문이 없으면 링크 몇 건이 모델
// 한도를 조용히 넘겨, 담당자에게는 이유 없는 "AI 작성에 실패했습니다"로만 보인다.
//
// 보내는 방식은 합계가 정한다 —
//   * 인라인 한도 안: 요청에 실어 보낸다. **아무것도 남지 않는다**(가장 안전한 길이라 기본이다).
//   * 넘으면: Files API로 올리고 주소만 참조한다. 올린 것은 index가 끝나며 지운다.
// 섞지 않고 전부 한 쪽으로 보내는 이유는 판정이 하나여야 하기 때문이다 — 건별로 가르면
// "어느 자료가 어느 길로 갔는가"가 실패를 재현할 때마다 달라진다.
//
// 바깥에서 읽어 오는 두 가지(스토리지 · 링크)는 호출자가 주입한다. 이 모듈이 소유하는 것은
// **예산과 순서**뿐이고 읽는 방법은 아니다 — 그래야 예산 규칙을 망 없이 검증할 수 있다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8.3

import { uploadFile, waitActive, type UploadedFile } from './filesApi.ts'
import { isTextOnlyMime } from './formats.ts'
import { isOfficeMime, officeText } from './officeText.ts'
import type { LinkContent, LinkError } from './linkRead.ts'
import { MAX_INLINE_BYTES, MAX_TEXT_BYTES, MAX_TOTAL_BYTES, mb } from './limits.ts'
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
}

export interface BuiltParts {
  /** 모델에 보낼 조각. 프롬프트는 호출자가 뒤에 붙인다. */
  parts: unknown[]
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
  name: string
  mime: string
  bytes: ArrayBuffer
}

const tooLarge = (): SourceError => ({
  code: 'too_large',
  message: `선택한 자료의 합이 너무 큽니다(${mb(MAX_TOTAL_BYTES)} 이하).`,
  status: 413,
})

/**
 * 자료를 손에 쥐고 예산 안에서 조각을 세운다.
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
  /** 글로 넘길 것들. 앞머리(label)가 무엇에서 온 글인지 모델에 말한다. */
  const texts: { label: string; text: string }[] = []
  const notices: string[] = []
  let used = 0
  /** 글자 계열이 쓴 몫. 전체 예산과 별개로 센다(같은 바이트라도 담기는 양이 다르다). */
  let textUsed = 0

  // 1) 자료를 실제로 가져오며 예산을 깎는다 -------------------------------------
  for (const s of sources) {
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
      const size = read.text != null ? new TextEncoder().encode(read.text).length : (read.bytes?.byteLength ?? 0)
      const isText = read.text != null || isTextOnlyMime(read.mime)
      if (used + size > MAX_TOTAL_BYTES) {
        notices.push(`앞선 자료로 용량을 다 써서 건너뛰었습니다: ${s.url}`)
        continue
      }
      if (isText && textUsed + size > MAX_TEXT_BYTES) {
        notices.push(`글자 자료가 모델이 한 번에 읽는 양을 넘어 건너뛰었습니다: ${s.url}`)
        continue
      }
      used += size
      if (isText) textUsed += size
      if (read.text != null) texts.push({ label: '[참고 링크: ' + s.url + ']', text: read.text })
      else if (read.bytes) files.push({ name: s.url, mime: read.mime, bytes: read.bytes })
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

    // 오피스 파일은 모델이 받지 않는다. 여기서 압축을 풀어 글자·표로 바꿔 넘긴다.
    // **읽기 실패는 통째 실패로 만들지 않는다** — 암호가 걸렸거나 그림뿐인 문서는 담당자가
    // 고를 때 알 수 없었던 사정이고, 그 한 건 때문에 나머지를 못 읽을 이유가 없다.
    if (isOfficeMime(s.mime)) {
      const read = await officeText(buf, s.mime, s.name)
      if (typeof read !== 'string') {
        notices.push(read.message)
        continue
      }
      // 예산은 파일 크기가 아니라 **뽑아 낸 글자**로 센다. 모델이 읽는 것이 그것이고,
      // 압축된 원본 크기는 그 양을 말해 주지 않는다(엑셀은 몇 배로 부푼다).
      const size = new TextEncoder().encode(read).length
      if (textUsed + size > MAX_TEXT_BYTES) {
        notices.push(`글자 자료가 모델이 한 번에 읽는 양을 넘어 건너뛰었습니다: ${s.name}`)
        continue
      }
      textUsed += size
      texts.push({ label: `[첨부 문서: ${s.name}]`, text: read })
      continue
    }

    if (isTextOnlyMime(s.mime)) {
      textUsed += buf.byteLength
      // 파일은 링크와 달리 담당자가 고를 때 크기를 알 수 있었으므로 건너뛰지 않고 답한다 —
      // 무엇을 빼야 하는지 말해 주지 않으면 같은 조합으로 계속 다시 시도하게 된다.
      if (textUsed > MAX_TEXT_BYTES) {
        return {
          error: {
            code: 'too_large',
            message: `글자 자료(텍스트·CSV 등)의 합이 ${mb(MAX_TEXT_BYTES)}를 넘습니다. 같은 크기라도 글자는 PDF보다 훨씬 많은 양이 담겨 모델이 한 번에 읽지 못합니다.`,
            status: 413,
          },
        }
      }
    }
    files.push({ name: s.name, mime: s.mime, bytes: buf })
  }

  // 2) 합계가 보내는 방식을 정한다 ----------------------------------------------
  const fileBytes = files.reduce((sum, f) => sum + f.bytes.byteLength, 0)
  const parts: unknown[] = []

  if (fileBytes <= MAX_INLINE_BYTES) {
    for (const f of files) parts.push({ inlineData: { mimeType: f.mime, data: toBase64(f.bytes) } })
  } else {
    for (const f of files) {
      const up = await uploadFile(deps.apiKey, f.bytes, f.mime, f.name, deps.signal)
      if ('message' in up) {
        notices.push(up.message)
        continue
      }
      uploaded.push(up)
      if (!(await waitActive(deps.apiKey, up, deps.signal))) {
        notices.push(`자료 처리가 끝나지 않아 건너뛰었습니다: ${f.name}`)
        continue
      }
      parts.push({ fileData: { mimeType: up.mime, fileUri: up.uri } })
    }
  }

  // 글로 뽑은 것은 파일 뒤에 세운다 — 자료의 본체는 파일이고, 글은 그것을 보충한다.
  for (const t of texts) parts.push({ text: `${t.label}\n${t.text}` })

  return { parts, notices }
}
