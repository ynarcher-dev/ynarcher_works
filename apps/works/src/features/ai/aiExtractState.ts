import { needsOriginal, PARSER_VERSION, type ExtractSummary } from '@docparse/types.ts'
import type { AiSource } from '@/features/ai/aiFillClient'
import { resolveAiMime } from '@/features/ai/aiFormats'

/**
 * 자료 줄의 **분석 상태**를 정한다 — 화면을 모르는 순수 모듈.
 *
 * 상태가 여섯인 이유는 담당자의 **다음 행동이 여섯 가지로 갈리기 때문**이다. 분석 전은 눌러야
 * 하고, 실패는 파일을 고쳐야 하며, 원본 분석은 그대로 두면 되고, 재분석 필요는 다시 눌러야
 * 한다. 상태를 뭉치면 그 행동이 화면에서 사라진다.
 *
 * **'분석 실패'와 '원본 분석'을 합치지 않는 것**이 특히 그렇다 — 앞은 담당자가 파일을 고쳐야
 * 하고(암호 해제·PDF로 다시 저장), 뒤는 아무것도 하지 않아도 된다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.3
 */

export type AiAnalysisState =
  /** 캐시가 없다. 담당자가 분석을 눌러야 한다. */
  | 'idle'
  /** 지금 열고 있다. */
  | 'running'
  /** 쓸 수 있는 글자가 있다. */
  | 'ready'
  /** 열지 못했다(암호·손상). 사유가 함께 선다. */
  | 'failed'
  /** 우리가 열지 않고 원본 그대로 모델에 보낸다(PDF·이미지). */
  | 'original'
  /** 캐시는 있는데 파서가 그새 달라졌다. */
  | 'stale'

/** 캐시 원장에서 읽어 온 한 줄(화면이 쓰는 부분만). */
export interface AiExtractRecord {
  status: 'ready' | 'failed' | 'original'
  parserVersion: string
  summary: ExtractSummary | null
  failedReason: string | null
  analyzedAt: string | null
}

/** 자료 줄 하나의 화면 상태. */
export interface AiSourceStatus {
  state: AiAnalysisState
  /** 상태 옆에 서는 한 줄(요약 건수 또는 실패 사유). 없으면 빈 문자열. */
  detail: string
  /** 이 자료가 작성에 쓰일 수 있는가 — 분석 완료이거나 원본으로 보낼 수 있는 것. */
  usable: boolean
  /** 지금 분석 버튼의 대상인가. */
  analyzable: boolean
}

const LABELS: Record<AiAnalysisState, string> = {
  idle: '분석 전',
  running: '분석 중',
  ready: '분석 완료',
  failed: '분석 실패',
  original: '원본 분석',
  stale: '재분석 필요',
}

export function stateLabel(state: AiAnalysisState): string {
  return LABELS[state]
}

/**
 * 요약 건수를 한 줄로. 형식마다 세는 것이 달라 값이 있는 것만 세운다.
 *
 * 글자 수를 언제나 함께 적는 이유는 **건수만으로는 실했는지 알 수 없기 때문**이다 —
 * 슬라이드 40장이어도 전부 그림이면 뽑힌 글자는 몇 줄뿐이다.
 */
export function summaryLabel(summary: ExtractSummary | null | undefined): string {
  if (!summary) return ''
  const parts: string[] = []
  if (summary.sheets) parts.push(`시트 ${summary.sheets}`)
  if (summary.slides) parts.push(`슬라이드 ${summary.slides}`)
  if (summary.paragraphs) parts.push(`문단 ${summary.paragraphs}`)
  if (summary.tables) parts.push(`표 ${summary.tables}`)
  parts.push(`${summary.chars.toLocaleString()}자`)
  if (summary.truncated) parts.push('앞부분만')
  return parts.join(' · ')
}

/** 이 자료를 우리가 열 수 있는가. 링크는 열어 봐야 알므로 여기서 잠그지 않는다. */
export function extractable(source: AiSource): boolean {
  if (source.kind === 'link') return true
  if (source.kind === 'attachment' && source.url) return true
  const resolved =
    source.kind === 'file'
      ? resolveAiMime(source.file.type, source.name)
      : resolveAiMime(source.contentType, source.name)
  return resolved ? !needsOriginal(resolved) : true
}

export interface StatusInput {
  source: AiSource
  /** 캐시 행(수정 모드) 또는 이번 세션에서 만든 결과(등록 모드). */
  record?: AiExtractRecord | null
  /** 지금 열고 있는가. */
  running?: boolean
  /** 담당자가 이 줄만 원본으로 보내기로 했는가. */
  forcedOriginal?: boolean
}

/**
 * 자료 한 줄의 상태를 정한다.
 *
 * 순서가 규칙이다 — **지금 하고 있는 일**이 먼저이고(running), 그다음이 **담당자가 정한
 * 것**(원본으로 보내기)이며, 마지막이 캐시가 말하는 사실이다. 담당자의 선택을 캐시보다
 * 뒤에 두면 분석이 끝난 자료를 원본으로 되돌릴 수 없다.
 */
export function sourceStatus({ source, record, running, forcedOriginal }: StatusInput): AiSourceStatus {
  if (running) return { state: 'running', detail: '', usable: false, analyzable: false }
  if (forcedOriginal) {
    return { state: 'original', detail: '담당자 지정', usable: true, analyzable: false }
  }
  if (!record) {
    // 캐시가 없다. PDF·이미지는 애초에 열지 않으므로 '분석 전'이 아니라 '원본 분석'이다.
    if (!extractable(source)) return { state: 'original', detail: '', usable: true, analyzable: false }
    return { state: 'idle', detail: '', usable: false, analyzable: true }
  }
  if (record.parserVersion !== PARSER_VERSION) {
    return { state: 'stale', detail: '분석기가 바뀌었습니다', usable: false, analyzable: true }
  }
  if (record.status === 'original') {
    return { state: 'original', detail: '', usable: true, analyzable: false }
  }
  if (record.status === 'failed') {
    return { state: 'failed', detail: record.failedReason ?? '', usable: false, analyzable: true }
  }
  return { state: 'ready', detail: summaryLabel(record.summary), usable: true, analyzable: true }
}

/**
 * 실행 버튼이 열리는 조건 — **고른 자료 중 하나라도 쓸 수 있으면 열린다.**
 *
 * 전부 준비되기를 기다리지 않는 이유는 분석 실패가 한 건 섞였다고 나머지로 초안을 못 만들
 * 이유가 없기 때문이다. 대신 빠지는 건수를 화면이 접지 않고 말한다.
 */
export function writableCount(statuses: AiSourceStatus[]): { usable: number; pending: number } {
  return {
    usable: statuses.filter((s) => s.usable).length,
    // '분석 전'과 '재분석 필요'만 센다 — 실패는 눌러도 달라지지 않을 수 있어 다른 말이 필요하다.
    pending: statuses.filter((s) => s.state === 'idle' || s.state === 'stale').length,
  }
}
