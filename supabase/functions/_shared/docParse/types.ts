// [자료 분석] 추출 결과의 모양 — 화면·서버·캐시 원장이 함께 쓰는 단 하나의 계약.
//
// 이 파일이 런타임을 모르는 것이 요점이다. 같은 타입을 브라우저(Web Worker의 파싱), Edge
// Function(링크 파싱·검증·저장), 캐시 원장(`attachment_extracts.body`)이 함께 쓴다. 모양이
// 두 곳에 살면 한쪽만 고치는 날이 오고, 그날 저장된 캐시는 읽는 쪽에서 조용히 빈 결과가 된다.
//
// Deno API를 쓰지 않는다(works vitest와 브라우저가 이 파일을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.4

/**
 * 파서 버전 — **캐시 무효화의 유일한 축**이다.
 *
 * 첨부는 교체 기능이 없어 불변이므로(업로드가 새 행이고 삭제는 `deleted_at`) 같은 첨부에서
 * 다른 글자가 나오는 경우는 **우리가 파서를 고쳤을 때**뿐이다. 그래서 추출 규칙이 달라지는
 * 변경(뽑는 범위·표 구성·상한)에서는 이 값을 올린다. 올리지 않으면 옛 규칙으로 뽑은 글자가
 * 새 규칙의 결과인 척 남는다.
 *
 * 반대로 **뽑는 결과가 같은 변경에서는 올리지 않는다** — 올리면 전 기업의 캐시가 한꺼번에
 * 무효가 되어 담당자가 이유 없이 재분석을 누르게 된다.
 */
export const PARSER_VERSION = '1'

/** 조각 한 덩이의 종류. 어디서 나온 글자인지를 말하고, 상한을 넘길 때 고르는 단위가 된다. */
export type ChunkKind =
  /** 엑셀 시트 한 장. */
  | 'sheet'
  /** 문서의 글줄 묶음(표 바깥). */
  | 'paragraph'
  /** 문서·슬라이드 안의 표 한 개. */
  | 'table'
  /** 발표 자료의 장표 한 장. */
  | 'slide'
  /** 글자만 담긴 파일(TXT·CSV·JSON·HTML…)의 한 도막. */
  | 'text'
  /** 바깥 주소에서 가져온 본문. */
  | 'link'

/**
 * 추출 결과의 최소 단위.
 *
 * `location`이 사람이 읽는 자리 표시(`시트: 손익`·`슬라이드 8`·`p.3`)인 것이 핵심이다.
 * 모델에게는 **어디서 본 값인지**를 말해 주는 근거가 되고(evidence), 담당자에게는 감사
 * 로그가 "무엇을 어디까지 보냈는가"를 답하는 근거가 된다.
 */
export interface ExtractChunk {
  kind: ChunkKind
  /** 사람이 읽는 자리 표시. 비어 있지 않다. */
  location: string
  /** 이 자리에서 뽑은 글자. 표만 있는 조각에서는 빈 문자열일 수 있다. */
  text: string
  /**
   * 이 자리에 있던 표들. 표 하나가 `행[열[셀]]`이다.
   *
   * 글자(`text`)에 탭으로 펼친 것과 **같은 내용을 두 모양으로** 갖는다. 중복으로 보이지만
   * 쓰임이 다르다 — 모델에 보내는 것은 글자이고, 예산을 넘겨 **표 단위로 골라 보낼 때**
   * 필요한 것이 이 배열이다. 2차에서 표에서 값을 직접 읽는 일도 여기에 붙는다.
   */
  tables: string[][][]
}

/**
 * 화면이 "시트 3 · 표 5"로 세우는 건수.
 *
 * 본문(`body`)과 따로 두는 이유는 **격자가 상태 줄을 그릴 때 본문을 내려받지 않기 위해서**다.
 * 자료 열넷의 본문을 다 받아 세면 창이 열릴 때마다 수 MB가 오간다.
 */
export interface ExtractSummary {
  sheets?: number
  paragraphs?: number
  slides?: number
  tables?: number
  pages?: number
  /** 뽑아 낸 글자 수. 어느 형식이든 채운다 — 자료가 얼마나 실했는지를 이 값이 답한다. */
  chars: number
  /** 상한에 걸려 앞부분만 담았는가. 담당자에게 그대로 알린다(조용히 자르지 않는다). */
  truncated?: boolean
}

/** 캐시 원장 `attachment_extracts.body`에 그대로 들어가는 모양. */
export interface ExtractBody {
  chunks: ExtractChunk[]
}

/** 분석 한 건의 결과 — 성공이면 본문과 건수, 실패면 사람이 읽을 사유. */
export type ExtractResult =
  | { status: 'ready'; body: ExtractBody; summary: ExtractSummary }
  | { status: 'failed'; reason: string }

/** 한 파일에서 뽑을 글자 수의 상한. 글자 예산(limits.ts)에 닿기 전에 파일 스스로 멈춘다. */
export const MAX_EXTRACT_CHARS = 200_000

/** 글자 계열 파일을 도막으로 나눌 때 한 도막의 크기. 자리 표시를 붙일 수 있는 단위로 끊는다. */
export const TEXT_CHUNK_CHARS = 40_000

/** 조각 하나가 가질 수 있는 글자 수의 상한(신뢰할 수 없는 입력을 검증할 때 쓴다). */
export const MAX_CHUNK_CHARS = 60_000

/** 한 결과가 가질 수 있는 조각 수의 상한(같은 이유). */
export const MAX_CHUNKS = 600

/** 조각 하나에 담을 수 있는 표의 수와 크기(같은 이유). */
export const MAX_TABLES_PER_CHUNK = 40
export const MAX_TABLE_ROWS = 500
export const MAX_TABLE_COLS = 100

/** 모든 조각의 글자를 합한 상한. 서버가 신뢰할 수 없는 입력을 받을 때 다시 잰다. */
export const MAX_BODY_CHARS = 400_000

/** 조각들의 글자를 하나로 잇는다 — 모델에 보낼 때의 표준 모양(자리 표시가 앞에 선다). */
export function chunksToText(chunks: ExtractChunk[]): string {
  return chunks
    .map((c) => (c.location ? `[${c.location}]\n${c.text}` : c.text))
    .filter((s) => s.trim().length > 0)
    .join('\n\n')
}

/** 조각들의 글자 수 합. 예산 판정과 요약 표시가 같은 값을 쓰게 한다. */
export function countChars(chunks: ExtractChunk[]): number {
  return chunks.reduce((sum, c) => sum + c.text.length, 0)
}

/**
 * 모델이 눈으로 보듯 읽는 형식인가 — 그렇다면 **우리가 열지 않는다.**
 *
 * PDF와 이미지가 그렇다. 장표 PDF는 표와 숫자가 시각 배치로 들어 있어, 글자만 뽑으면 행·열이
 * 흐트러져 초안이 지금보다 나빠진다. 그래서 이 둘은 원본 그대로 모델에 보낸다.
 *
 * **판정만 이 파일에 두는 것이 요점이다.** 화면이 자료 줄의 상태를 그릴 때 이 답이 필요한데,
 * 파서가 든 모듈에서 꺼내 오면 ZIP·오피스 파서가 통째로 첫 화면 번들에 실린다. 파서는
 * 분석을 누르는 순간에만 필요하다.
 */
export function needsOriginal(mime: string): boolean {
  return mime === 'application/pdf' || mime.startsWith('image/')
}

/** 우리가 열 수 있는 형식인가. */
export function isExtractableMime(mime: string): boolean {
  return !needsOriginal(mime)
}
