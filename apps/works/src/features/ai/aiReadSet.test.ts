import { describe, expect, it } from 'vitest'
import type { AiSource } from '@/features/ai/aiFillClient'
import {
  defaultPlacements,
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
 * 지키는 것 넷 — **기본 자리는 파일명이 정한다**, **참조 자료는 내리되 자기 자료가 있을 때만**,
 * **담당자의 이동이 기본값을 이긴다**, **기본 자리로 되돌리면 기억이 사라진다**(같은 사실을 두
 * 곳에 적지 않는다).
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

/** 남의 원장에서 끌어온 줄 — `origin`이 붙는 것이 참조라는 사실의 전부다(aiFillClient.ts). */
const ref = (key: string, name: string): AiSource => ({
  kind: 'attachment',
  key,
  id: key,
  name,
  bytes: 10,
  readable: true,
  url: null,
  contentType: null,
  origin: '스타트업DB',
})

/** 기본 자리를 한 줄로 묻는다. 목록 전체가 판정에 드는 값이 됐으므로 시험도 목록으로 묻는다. */
const placeOf = (sources: AiSource[], s: AiSource) => defaultPlacements(sources)[s.key]

const ir = file('a', '2025 IR.pdf')
const fs = file('b', '재무제표_2024.xlsx')
const memo = file('c', '회의록.docx')

describe('기본 자리', () => {
  it('파일명이 종류를 답하고, 아는 종류만 읽을 자료에 선다', () => {
    const all = [ir, fs, memo]
    expect(sourceKindOf(ir)).toBe('ir')
    expect(placeOf(all, ir)).toBe('read')
    expect(placeOf(all, fs)).toBe('read')
    expect(sourceKindOf(memo)).toBe('other')
    expect(placeOf(all, memo)).toBe('skip')
  })

  it('링크는 주소로 판정한다', () => {
    const a = link('https://drive.example/재무제표.pdf')
    const b = link('https://docs.example/d/abc/edit')
    expect(placeOf([a, b], a)).toBe('read')
    expect(placeOf([a, b], b)).toBe('skip')
  })

  it('참조 자료는 내린다 — 그 값은 이미 확정 사실로 넘어가므로 다시 읽히지 않는다', () => {
    const refIr = ref('r', '2025 IR.pdf')
    // 파일명만 보면 올라갈 줄이지만, 남의 원장 것이고 자기 자료가 있으므로 내려간다.
    expect(placeOf([ir, refIr], refIr)).toBe('skip')
    expect(placeOf([ir, refIr], ir)).toBe('read')
  })

  it('자기 자료가 하나도 없으면 참조를 내리지 않는다 — 읽을 것이 0건인 창을 열지 않는다', () => {
    const refIr = ref('r', '2025 IR.pdf')
    const refMemo = ref('r2', '회의록.docx')
    expect(placeOf([refIr, refMemo], refIr)).toBe('read')
    expect(placeOf([refIr, refMemo], refMemo)).toBe('skip')
  })
})

describe('이동', () => {
  const all = [ir, fs, memo]
  const defaults = defaultPlacements(all)

  it('옮긴 줄만 기억하고, 기본 자리로 되돌리면 기억이 사라진다', () => {
    let set = moveSource({}, defaults, memo, 'read')
    expect(set).toEqual({ c: 'read' })
    expect(placementOf(set, defaults, memo)).toBe('read')
    set = moveSource(set, defaults, memo, 'skip')
    expect(set).toEqual({})
  })

  it('기본 자리와 같은 방향으로 옮기는 것은 아무것도 남기지 않는다', () => {
    expect(moveSource({}, defaults, ir, 'read')).toEqual({})
  })

  it('참조 자료를 올린 기억은 남고, 되내리면 사라진다', () => {
    const refIr = ref('r', '2025 IR.pdf')
    const d = defaultPlacements([ir, refIr])
    let set = moveSource({}, d, refIr, 'read')
    expect(set).toEqual({ r: 'read' })
    set = moveSource(set, d, refIr, 'skip')
    expect(set).toEqual({})
  })

  it('전부 옮기기는 건네받은 줄에만 걸린다', () => {
    const set = moveAll({}, defaults, [ir, fs], 'skip')
    expect(splitSources(set, defaults, all).read).toEqual([])
    expect(set).toEqual({ a: 'skip', b: 'skip' })
  })

  it('두 칸으로 가르되 원래 순서를 지킨다', () => {
    const set = moveSource({}, defaults, memo, 'read')
    const { read, skip } = splitSources(set, defaults, [memo, ir, fs])
    expect(read.map((s) => s.key)).toEqual(['c', 'a', 'b'])
    expect(skip).toEqual([])
  })

  it('사라진 자료의 기억을 걷는다', () => {
    expect(pruneReadSet({ a: 'skip', zzz: 'read' }, ['a'])).toEqual({ a: 'skip' })
  })
})
