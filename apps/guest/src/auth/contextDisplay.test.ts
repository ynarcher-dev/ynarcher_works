import { describe, expect, it } from 'vitest'
import { accessEndLabel, contextTags, switcherState } from '@/auth/contextDisplay'

/**
 * 맥락 표시 규칙 회귀 — 세 화면(로그인 선택·사이드바 전환기·개요 요약)이 같은 맥락을
 * 같은 말로 그리는지 본다. 그리는 일은 DOM이 하지만 **무엇을 그릴지 정하는 규칙**은
 * 순수 함수라, 화면 없이 여기서 고정한다.
 */

describe('맥락 태그 — 종류와 자격', () => {
  it('종류 다음 자격 순서로 선다', () => {
    expect(contextTags('program', 'startups').map((t) => t.label)).toEqual([
      '프로젝트',
      '참여 기업',
    ])
  })

  it('세 종류를 각각 자기 이름으로 부른다', () => {
    expect(contextTags('ma_program', null).map((t) => t.label)).toEqual(['M&A 프로젝트'])
    expect(contextTags('fund', null).map((t) => t.label)).toEqual(['FUND'])
    expect(contextTags('program', null).map((t) => t.label)).toEqual(['프로젝트'])
  })

  it('전문가 자격은 명부 탭과 같은 말을 쓴다', () => {
    expect(contextTags('fund', 'networks').map((t) => t.label)).toEqual(['FUND', '참여 전문가'])
  })

  it('모르는 종류·빈 자격은 지어내지 않는다', () => {
    expect(contextTags(null, null)).toEqual([])
    expect(contextTags('unknown_kind', null)).toEqual([])
    expect(contextTags(undefined, 'startups').map((t) => t.label)).toEqual(['참여 기업'])
  })

  it('한 목록 안에서 태그 key가 겹치지 않는다', () => {
    const keys = contextTags('program', 'startups').map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('접근 종료일', () => {
  it('날짜가 있으면 `~ 날짜`로 적는다', () => {
    expect(accessEndLabel('2026-12-31T00:00:00.000Z')).toMatch(/^~ /)
  })

  it('없거나 읽을 수 없으면 아무 말도 하지 않는다', () => {
    expect(accessEndLabel(null)).toBeNull()
    expect(accessEndLabel(undefined)).toBeNull()
    expect(accessEndLabel('언젠가')).toBeNull()
  })
})

describe('전환기의 상태 — 빈 목록과 실패를 "하나뿐"으로 읽지 않는다', () => {
  it('갈 곳이 둘 이상이면 펼칠 수 있다', () => {
    expect(switcherState({ count: 2, loading: false, error: false })).toBe('switchable')
  })

  it('목록을 다시 받는 중이어도 이미 둘 이상이면 컨트롤이 접히지 않는다', () => {
    expect(switcherState({ count: 3, loading: true, error: false })).toBe('switchable')
  })

  it('아직 목록을 모르면 로딩이다 — 참여가 하나라고 단정하지 않는다', () => {
    // 이 자리가 바로 종전의 사고 지점이다: 로그인 직후 목록이 비어 있는 동안
    // `contexts.length > 1`만 보면 참여가 여럿인 사람도 읽기 전용 표시를 받았다.
    expect(switcherState({ count: 0, loading: true, error: false })).toBe('loading')
    expect(switcherState({ count: 1, loading: true, error: false })).toBe('loading')
  })

  it('목록을 받지 못했으면 실패로 선다(로딩이 함께 서 있어도)', () => {
    expect(switcherState({ count: 0, loading: false, error: true })).toBe('error')
    expect(switcherState({ count: 0, loading: true, error: true })).toBe('error')
  })

  it('목록을 받았고 갈 곳이 하나면 읽기 전용이다', () => {
    expect(switcherState({ count: 1, loading: false, error: false })).toBe('single')
    expect(switcherState({ count: 0, loading: false, error: false })).toBe('single')
  })
})
