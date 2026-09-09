import { describe, expect, it } from 'vitest'
import type { AiSource } from '@/features/ai/aiFillClient'
import {
  defaultPlacement,
  moveAll,
  moveSource,
  placementOf,
  pruneReadSet,
  sourceKindOf,
  splitSources,
} from '@/features/ai/aiReadSet'

/**
 * 자료 배치의 회귀 테스트.
 *
 * 지키는 것 셋 — **기본 자리는 파일명이 정한다**, **담당자의 이동이 기본값을 이긴다**, **기본
 * 자리로 되돌리면 기억이 사라진다**(같은 사실을 두 곳에 적지 않는다).
 *
 * 근거: docs/docs_planning/3_3_7_ai_fill_visual_read.md §4
 */

const file = (key: string, name: string): AiSource => ({
  kind: 'attachment',
  key,
  id: key,
  name,
  bytes: 10,
  readable: true,
  url: null,
  contentType: null,
})

const link = (url: string): AiSource => ({ kind: 'link', key: `link:${url}`, name: url, bytes: null, readable: true, url })

const ir = file('a', '2025 IR.pdf')
const fs = file('b', '재무제표_2024.xlsx')
const memo = file('c', '회의록.docx')

describe('기본 자리', () => {
  it('파일명이 종류를 답하고, 아는 종류만 읽을 자료에 선다', () => {
    expect(sourceKindOf(ir)).toBe('ir')
    expect(defaultPlacement(ir)).toBe('read')
    expect(defaultPlacement(fs)).toBe('read')
    expect(sourceKindOf(memo)).toBe('other')
    expect(defaultPlacement(memo)).toBe('skip')
  })

  it('링크는 주소로 판정한다', () => {
    expect(defaultPlacement(link('https://drive.example/재무제표.pdf'))).toBe('read')
    expect(defaultPlacement(link('https://docs.example/d/abc/edit'))).toBe('skip')
  })
})

describe('이동', () => {
  it('옮긴 줄만 기억하고, 기본 자리로 되돌리면 기억이 사라진다', () => {
    let set = moveSource({}, memo, 'read')
    expect(set).toEqual({ c: 'read' })
    expect(placementOf(set, memo)).toBe('read')
    set = moveSource(set, memo, 'skip')
    expect(set).toEqual({})
  })

  it('기본 자리와 같은 방향으로 옮기는 것은 아무것도 남기지 않는다', () => {
    expect(moveSource({}, ir, 'read')).toEqual({})
  })

  it('전부 옮기기는 건네받은 줄에만 걸린다', () => {
    const set = moveAll({}, [ir, fs], 'skip')
    expect(splitSources(set, [ir, fs, memo]).read).toEqual([])
    expect(set).toEqual({ a: 'skip', b: 'skip' })
  })

  it('두 칸으로 가르되 원래 순서를 지킨다', () => {
    const set = moveSource({}, memo, 'read')
    const { read, skip } = splitSources(set, [memo, ir, fs])
    expect(read.map((s) => s.key)).toEqual(['c', 'a', 'b'])
    expect(skip).toEqual([])
  })

  it('사라진 자료의 기억을 걷는다', () => {
    expect(pruneReadSet({ a: 'skip', zzz: 'read' }, ['a'])).toEqual({ a: 'skip' })
  })
})
