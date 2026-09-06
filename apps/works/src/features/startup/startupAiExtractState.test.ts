import { describe, expect, it } from 'vitest'
import { PARSER_VERSION } from '@docparse/types.ts'
import { sourceStatus, stateLabel, summaryLabel, writableCount } from '@/features/startup/startupAiExtractState'
import type { AiExtractRecord } from '@/features/startup/startupAiExtractState'
import type { AiSource } from '@/features/startup/startupAiFill'

/**
 * 자료 줄 상태 판정의 회귀 테스트.
 *
 * 여기서 지키는 것 셋 — **같은 파일·같은 파서는 다시 분석하지 않는다**(캐시 재사용),
 * **파서가 달라지면 재분석으로 선다**, **담당자가 원본으로 돌린 줄은 캐시를 이긴다.**
 * 마지막 것을 놓치면 이미 분석된 자료를 원본으로 되돌릴 방법이 화면에서 사라진다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.3·§16.10
 */

const attachment = (over: Partial<Extract<AiSource, { kind: 'attachment' }>> = {}): AiSource => ({
  kind: 'attachment',
  key: 'A1',
  id: 'A1',
  name: '사업계획서.xlsx',
  bytes: 1024,
  readable: true,
  url: null,
  contentType: null,
  ...over,
})

const ready: AiExtractRecord = {
  status: 'ready',
  parserVersion: PARSER_VERSION,
  summary: { chars: 1200, sheets: 2, tables: 2 },
  failedReason: null,
  analyzedAt: '2026-09-06T00:00:00Z',
}

describe('캐시 재사용', () => {
  it('같은 파서 버전의 완료 행이 있으면 분석 완료로 서고 다시 분석할 수 있다', () => {
    const status = sourceStatus({ source: attachment(), record: ready })
    expect(status.state).toBe('ready')
    expect(status.usable).toBe(true)
    expect(status.detail).toContain('시트 2')
  })

  it('캐시가 없으면 분석 전이고 분석 대상이다', () => {
    const status = sourceStatus({ source: attachment(), record: null })
    expect(status.state).toBe('idle')
    expect(status.usable).toBe(false)
    expect(status.analyzable).toBe(true)
  })

  it('파서 버전이 다르면 재분석 필요다(옛 규칙의 글자를 그대로 쓰지 않는다)', () => {
    const status = sourceStatus({ source: attachment(), record: { ...ready, parserVersion: 'old' } })
    expect(status.state).toBe('stale')
    expect(status.usable).toBe(false)
    expect(status.analyzable).toBe(true)
  })
})

describe('우리가 열지 않는 자료', () => {
  it('PDF는 캐시가 없어도 원본 분석으로 선다(분석 버튼의 대상이 아니다)', () => {
    const status = sourceStatus({ source: attachment({ name: '사업계획서.pdf' }), record: null })
    expect(status.state).toBe('original')
    expect(status.usable).toBe(true)
    expect(status.analyzable).toBe(false)
  })

  it('이미지도 같다', () => {
    expect(sourceStatus({ source: attachment({ name: '로고.png' }), record: null }).state).toBe('original')
  })

  it('첨부 링크는 열어 봐야 알므로 분석 전으로 선다', () => {
    const link = attachment({ name: 'docs.google.com', url: 'https://docs.google.com/x', bytes: null })
    expect(sourceStatus({ source: link, record: null }).state).toBe('idle')
  })
})

describe('상태의 우선순위', () => {
  it('진행 중이 가장 앞선다', () => {
    expect(sourceStatus({ source: attachment(), record: ready, running: true }).state).toBe('running')
  })

  it('담당자가 원본으로 지정하면 분석 완료보다 앞선다', () => {
    const status = sourceStatus({ source: attachment(), record: ready, forcedOriginal: true })
    expect(status.state).toBe('original')
    expect(status.usable).toBe(true)
  })

  it('실패는 사유를 그대로 들고 선다', () => {
    const status = sourceStatus({
      source: attachment(),
      record: { ...ready, status: 'failed', summary: null, failedReason: '암호가 걸린 문서입니다' },
    })
    expect(status.state).toBe('failed')
    expect(status.detail).toBe('암호가 걸린 문서입니다')
    expect(status.usable).toBe(false)
  })
})

describe('요약과 집계', () => {
  it('건수와 글자 수를 함께 적는다(건수만으로는 실했는지 알 수 없다)', () => {
    expect(summaryLabel({ chars: 1200, slides: 40 })).toBe('슬라이드 40 · 1,200자')
    expect(summaryLabel({ chars: 10, truncated: true })).toContain('앞부분만')
    expect(summaryLabel(null)).toBe('')
  })

  it('분석 전과 재분석 필요만 미준비로 센다(실패는 눌러도 달라지지 않을 수 있다)', () => {
    const counts = writableCount([
      sourceStatus({ source: attachment(), record: ready }),
      sourceStatus({ source: attachment(), record: null }),
      sourceStatus({ source: attachment(), record: { ...ready, parserVersion: 'old' } }),
      sourceStatus({ source: attachment(), record: { ...ready, status: 'failed', failedReason: 'x' } }),
    ])
    expect(counts).toEqual({ usable: 1, pending: 2 })
  })

  it('상태 이름은 화면 용어를 쓴다(파싱이라 적지 않는다)', () => {
    expect(stateLabel('ready')).toBe('분석 완료')
    expect(stateLabel('original')).toBe('원본 분석')
  })
})
