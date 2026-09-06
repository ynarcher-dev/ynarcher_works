// [AI 작성하기] 최소 ZIP 리더 — 오피스 파일 안을 열기 위한 것.
//
// xlsx·docx·pptx는 확장자만 다를 뿐 실제로는 **XML 여러 개를 묶은 ZIP**이다. 압축을 풀지 않으면
// 안이 뭉개진 이진 데이터라 모델에 보내 봐야 글자가 하나도 안 보인다. 그래서 우리가 푼다.
//
// 라이브러리를 쓰지 않는 이유는 필요한 것이 이 파일만큼뿐이기 때문이다 — 우리는 **알고 있는
// 이름의 항목 몇 개를 읽기만** 하고, 쓰지도 지우지도 않는다. 압축 해제는 런타임이 이미 가진
// `DecompressionStream('deflate-raw')`이 한다.
//
// 항목의 크기·위치는 **중앙 디렉터리에서만** 읽는다. 로컬 헤더의 크기 칸은 비어 있을 수 있고
// (일부 도구가 데이터 뒤에 따로 적는다) 그 값을 믿으면 0바이트를 읽게 된다.
//
// ZIP64는 다루지 않는다. 4GB를 넘는 자료가 있어야 필요한데 한 건 상한이 30MB다.
//
// Deno API를 쓰지 않는다(works vitest가 이 파일을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §2.2

const EOCD_SIG = 0x06054b50
const CENTRAL_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50
/** ZIP 주석 최대 길이. 끝에서 이만큼만 되짚으면 EOCD가 반드시 있다. */
const MAX_COMMENT = 0xffff

export interface ZipEntry {
  name: string
  /** 0=저장(압축 안 함), 8=deflate. 그 밖은 우리가 풀지 못한다. */
  method: number
  localOffset: number
  compressedSize: number
}

/**
 * 항목 목록을 읽는다. ZIP이 아니거나 구조가 어긋나면 null.
 *
 * 이름을 키로 하는 Map을 돌려주는 것은 우리가 찾는 방식 그대로여서다 — 오피스 파일의 내용물은
 * 이름이 정해져 있다(`word/document.xml`, `xl/workbook.xml`…).
 */
export function readZipIndex(buf: ArrayBuffer): Map<string, ZipEntry> | null {
  const bytes = new Uint8Array(buf)
  if (bytes.length < 22) return null
  const view = new DataView(buf)

  let eocd = -1
  const floor = Math.max(0, bytes.length - MAX_COMMENT - 22)
  for (let i = bytes.length - 22; i >= floor; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null

  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  const entries = new Map<string, ZipEntry>()
  const decoder = new TextDecoder()
  for (let i = 0; i < count; i += 1) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== CENTRAL_SIG) return null
    const nameLen = view.getUint16(p + 28, true)
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    entries.set(name, {
      name,
      method: view.getUint16(p + 10, true),
      compressedSize: view.getUint32(p + 20, true),
      localOffset: view.getUint32(p + 42, true),
    })
    p += 46 + nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true)
  }
  return entries
}

/** 항목 하나를 풀어 글자로 돌려준다(오피스 내용물은 전부 UTF-8 XML이다). 못 풀면 null. */
export async function readZipText(buf: ArrayBuffer, entry: ZipEntry): Promise<string | null> {
  const view = new DataView(buf)
  const p = entry.localOffset
  if (p + 30 > buf.byteLength || view.getUint32(p, true) !== LOCAL_SIG) return null
  const start = p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true)
  if (start + entry.compressedSize > buf.byteLength) return null

  const raw = new Uint8Array(buf, start, entry.compressedSize)
  if (entry.method === 0) return new TextDecoder().decode(raw)
  if (entry.method !== 8) return null
  try {
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return await new Response(stream).text()
  } catch {
    return null
  }
}
