// [AI 작성하기] 근거를 원문과 대조한다 — 모델이 적은 자리를 그대로 믿지 않는다.
//
// 종전의 근거는 모델이 만든 문자열 한 줄("p.47 재무 현황")이었고, 그 문자열이 실제 자리인지
// 물어볼 대상이 없었다. 그래서 담당자에게 근거는 **확인할 수 없는 안내**였다 — 있으면 안심이
// 되지만 틀렸을 때 알 방법이 없으니, 안심하는 쪽으로만 작동했다.
//
// 구조를 바꾸는 것만으로는 아무것도 검증되지 않는다. `{ chunkId, quote }`를 내라고 지시해도
// 모델은 둘 다 지어낼 수 있다. 검증이 성립하려면 **id를 우리가 발급하고**(chunks.ts) 그 id가
// 이번 요청에 실제로 실렸는지, 인용문이 그 조각 안에 실제로 있는지를 우리가 되묻는 수밖에 없다.
//
// 세 갈래로 답한다.
//   * **확인됨** — id가 이번 요청에 있었고 인용문도 그 조각 안에 있다.
//   * **미검증** — 우리가 열지 않은 자료(PDF·이미지)를 가리켰다. 대조할 글자가 우리에게 없다.
//     지어낸 것과 다르므로 지우지 않고 그렇게 표시한다.
//   * **버림** — id가 이번 요청에 없거나, 조각 안에 없는 문장을 인용했다. 값은 그대로 두고
//     근거만 뗀다 — 근거가 틀렸다고 값까지 지우면 맞는 값을 함께 잃고, 조용히 두면 검증에
//     아무 뜻이 없다. 몇 건을 뗐는지는 카드의 경고 한 줄이 말한다.
//
// Deno API를 쓰지 않는다(works vitest가 이 판정을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.15

import type { ChunkIndex } from './chunks.ts'

/** 모델이 돌려준 근거 한 줄(신뢰하지 않는 입력). */
export interface RawEvidence {
  chunkId?: unknown
  quote?: unknown
}

/** 검증을 마친 근거 한 줄. 파일명과 자리는 **서버가** 붙인 값이다. */
export interface Evidence {
  /** 원문에서 확인했는가. 거짓이면 우리가 열지 않은 자료를 가리킨 것이다. */
  verified: boolean
  fileName: string
  /** 조각의 자리(`시트: 손익`). 자료 전체를 가리킨 근거에서는 빈 문자열이다. */
  location: string
  /** 모델이 인용한 문장. 확인된 근거에서는 원문에 실재하는 글자다. */
  quote: string | null
  /** 자료로 되짚을 첨부 행. 등록 모드의 보류 자료는 null이다. */
  attachmentId: string | null
}

export interface EvidenceStats {
  verified: number
  unverified: number
  /** 대조에 실패해 뗀 근거 수. 이 값이 높으면 프롬프트나 조각 크기를 의심한다. */
  rejected: number
}

/**
 * 대조를 위한 정규화.
 *
 * 표에서 뽑은 숫자가 대조에서 가장 잘 어긋난다 — 원문의 `1,200`을 모델이 `1200`으로 적고,
 * 셀 사이의 탭이 모델의 답에서는 공백 하나가 된다. 그 차이로 맞는 근거를 떨어뜨리면 검증이
 * 담당자에게 잡음이 되고, 잡음이 되는 순간 아무도 보지 않는다. 그래서 **양쪽에 같은 정규화를
 * 걸고** 비교한다.
 *
 * 반대로 지나치게 느슨하면(예: 앞 몇 글자만 비교) 검증이 통과 도장이 된다. 그래서 지우는 것은
 * 표기 차이뿐이고 글자 자체는 남긴다.
 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s\u00a0\u3000]+/g, '')
    .replace(/[,，.。·・‧]/g, '')
    .replace(/[()（）[\]{}<>"'"'`~|/\-]/g, '')
}

/** 대조에 쓸 만큼 특징적인가. 너무 짧은 인용은 어느 문서에나 있어 검증이 되지 못한다. */
const MIN_QUOTE_CHARS = 4

/** 근거 한 카드분의 상한. 화면이 접어 두는 값이라 길게 받을 이유가 없다. */
const MAX_PER_CARD = 5

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, max) : null
}

/**
 * 근거 목록을 이번 요청의 지도와 대조한다.
 *
 * @param index 이번 요청이 **실제로 실어 보낸** 조각과 자료. 다른 요청의 지도를 넘기면
 *   모델이 보지 못한 조각을 근거로 인정하게 된다.
 */
export function verifyEvidence(raw: unknown, index: ChunkIndex): { evidence: Evidence[]; stats: EvidenceStats } {
  const stats: EvidenceStats = { verified: 0, unverified: 0, rejected: 0 }
  const evidence: Evidence[] = []
  if (!Array.isArray(raw)) return { evidence, stats }

  for (const item of raw) {
    if (evidence.length >= MAX_PER_CARD) break
    if (!item || typeof item !== 'object') continue
    const { chunkId, quote } = item as RawEvidence
    const id = text(chunkId, 40)
    const said = text(quote, 300)
    if (!id) {
      stats.rejected += 1
      continue
    }

    const chunk = index.chunks.get(id)
    if (chunk) {
      // 인용문이 그 조각 안에 실제로 있는가. 인용이 없거나 너무 짧으면 대조할 것이 없다.
      const ok = said != null && normalize(said).length >= MIN_QUOTE_CHARS && normalize(chunk.text).includes(normalize(said))
      if (!ok) {
        stats.rejected += 1
        continue
      }
      stats.verified += 1
      evidence.push({
        verified: true,
        fileName: chunk.source.name,
        location: chunk.location,
        quote: said,
        attachmentId: chunk.source.attachmentId,
      })
      continue
    }

    // 조각이 아니라 자료 전체를 가리킨 경우. **우리가 열지 않은 자료에서만 인정한다** —
    // 조각으로 세운 자료를 통째로 가리키는 것은 "어디서 봤는지 말하지 않겠다"와 같다.
    const source = index.sources.get(id)
    if (source && !source.verifiable) {
      stats.unverified += 1
      evidence.push({
        verified: false,
        fileName: source.name,
        location: '',
        quote: said,
        attachmentId: source.attachmentId,
      })
      continue
    }
    stats.rejected += 1
  }

  return { evidence, stats }
}

/** 뗀 근거를 담당자에게 알리는 한 줄. 카드마다 한 번만 선다(건마다 세우면 경고의 벽이 된다). */
export function rejectedNote(count: number): string {
  return `근거 ${count}건이 원문에서 확인되지 않아 제외했습니다. 값은 그대로 두었으니 확인이 필요합니다.`
}

/**
 * 모델에게 근거를 어떻게 적을지 지시한다 — **엔진이 소유한다.**
 *
 * 대상(스타트업·전문가·사업)이 무엇이든 근거를 대는 방식은 같고, 무엇보다 id 규약은 우리가
 * 발급한 것이라 프로파일이 다시 적을 자리가 아니다. 프로파일이 적으면 규약과 검증이 두 곳에
 * 살게 되고, 어긋나는 날 모든 근거가 조용히 버려진다.
 */
export const EVIDENCE_RULES = `근거(evidence) 규칙:
- 카드마다 evidence 목록에 그 값을 어디서 읽었는지 남깁니다. 한 카드 최대 ${MAX_PER_CARD}건입니다.
- chunkId: 자료에 붙은 대괄호 표시의 id를 **그대로** 적습니다(예: [s2#5 | 시트: 손익] → "s2#5").
  id를 지어내지 않습니다. 목록에 없는 id는 버려집니다.
- quote: 그 조각에 **실제로 있는 문장을 그대로** 옮깁니다(10~60자). 요약·번역·재작성하지 않습니다.
  옮긴 문장이 그 조각에 없으면 그 근거는 버려집니다.
- 조각 표시가 없는 자료(PDF·이미지)는 자료 id만 적습니다(예: "s2"). 그 경우 quote는 문서에서 본
  문장을 적되, 우리가 대조하지 못하므로 '미검증'으로 표시됩니다.
- 파일명·페이지 번호를 직접 쓰지 않습니다. 그 정보는 chunkId로부터 시스템이 붙입니다.`
