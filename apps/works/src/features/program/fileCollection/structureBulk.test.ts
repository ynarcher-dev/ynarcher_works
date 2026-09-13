import { describe, expect, it } from 'vitest'
import {
  buildStructureTemplateCsv,
  bulkSampleText,
  parseBulkStructure,
  parseRequired,
} from '@/features/program/fileCollection/structureBulk'
import {
  appendBulkBranches,
  draftFromNodes,
  structureIssues,
} from '@/features/program/fileCollection/structureDraft'

/**
 * 문항 대용량 등록 — 붙여 넣은 표를 어떻게 읽고 어떻게 트리에 붙이는가.
 *
 * 지키려는 것 넷이다. (1) 엑셀에서 복사한 탭 표와 손으로 적은 쉼표 표를 **한 글 안에서 한
 * 가지 기준으로** 읽는다, (2) 비운 상위 칸은 위 줄을 잇되 문항은 잇지 않는다, (3) 못 읽은
 * 줄은 조용히 넘어가지 않고 이유를 남긴다, (4) 같은 이름의 분류에는 붙고 문항은 언제나 새로
 * 선다.
 */

const LEVELS = ['대분류', '문항']

describe('붙여 넣은 표 읽기', () => {
  it('탭이 하나라도 있으면 글 전체를 탭으로 가른다(안내의 쉼표가 칸을 밀지 않는다)', () => {
    const result = parseBulkStructure('재무\t결산서\tY\t쉼표, 포함된 안내', LEVELS)
    expect(result.separator).toBe('tab')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]!.error).toBeNull()
    expect(result.valid[0]).toEqual({
      titles: ['재무', '결산서'],
      guide: '쉼표, 포함된 안내',
      isRequired: true,
    })
  })

  it('탭이 없으면 쉼표로 가른다', () => {
    const result = parseBulkStructure('재무,결산서', LEVELS)
    expect(result.separator).toBe('comma')
    expect(result.valid[0]!.titles).toEqual(['재무', '결산서'])
    expect(result.valid[0]!.isRequired).toBe(false)
  })

  it('빈 상위 칸은 위 줄을 잇고, 문항 칸은 잇지 않는다', () => {
    const result = parseBulkStructure('재무\t결산서\n\t통장 사본\n재무\t', LEVELS)
    expect(result.rows.map((r) => r.branch.titles)).toEqual([
      ['재무', '결산서'],
      ['재무', '통장 사본'],
      ['재무', ''],
    ])
    // 문항 이름이 빈 줄은 담지 않는다.
    expect(result.rows[2]!.error).toBe('2번째 단계 이름이 비어 있습니다.')
    expect(result.valid).toHaveLength(2)
  })

  it('본보기 머리글을 그대로 붙여 넣으면 값으로 세지 않는다', () => {
    const result = parseBulkStructure(bulkSampleText(LEVELS), LEVELS)
    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((r) => r.line)).toEqual([1, 2])
  })

  it('내려받은 양식을 그대로 되읽으면 머리글은 빠지고 예시 두 줄만 선다', () => {
    const csv = buildStructureTemplateCsv(LEVELS)
    const result = parseBulkStructure(csv, LEVELS)
    expect(result.separator).toBe('comma')
    expect(result.rows).toHaveLength(2)
    expect(result.valid.map((b) => b.titles[1])).toEqual(['사업자등록증', '통장 사본'])
    expect(result.valid[0]!.isRequired).toBe(true)
    expect(result.valid[1]!.isRequired).toBe(false)
  })

  it('엑셀이 붙인 BOM이 머리글을 어긋내지 않는다', () => {
    const csv = '﻿' + buildStructureTemplateCsv(LEVELS)
    expect(parseBulkStructure(csv, LEVELS).rows).toHaveLength(2)
  })

  it('CSV의 따옴표 안 쉼표는 칸을 가르지 않는다(양식이 왕복한다)', () => {
    const csv = buildStructureTemplateCsv(LEVELS) + '\n재무,결산서,Y,"PDF, 스캔본 모두"'
    const rows = parseBulkStructure(csv, LEVELS).valid
    expect(rows[2]).toEqual({
      titles: ['재무', '결산서'],
      guide: 'PDF, 스캔본 모두',
      isRequired: true,
    })
  })

  it('필수 칸을 못 읽으면 그 줄만 막고 이유를 남긴다', () => {
    const result = parseBulkStructure('재무\t결산서\t아마도', LEVELS)
    expect(result.valid).toHaveLength(0)
    expect(result.rows[0]!.error).toContain('필수 칸을 읽지 못했습니다')
  })

  it('칸이 남으면 알린다 — 단계 수를 잘못 잡은 표를 조용히 잘라 넣지 않는다', () => {
    const result = parseBulkStructure('재무\t결산서\tY\t안내\t군더더기', LEVELS)
    expect(result.rows[0]!.error).toContain('칸이 너무 많습니다')
  })

  it('필수 칸의 말들', () => {
    expect(parseRequired('Y')).toBe(true)
    expect(parseRequired('필수')).toBe(true)
    expect(parseRequired('')).toBe(false)
    expect(parseRequired('선택')).toBe(false)
    expect(parseRequired('글쎄')).toBeNull()
  })
})

describe('초안에 붙이기', () => {
  it('같은 이름의 분류에는 붙고, 문항은 이름이 같아도 새로 선다', () => {
    const { valid } = parseBulkStructure('재무\t결산서\n재무\t결산서\n인사\t명부', LEVELS)
    const draft = appendBulkBranches(draftFromNodes([], LEVELS), valid)
    expect(draft.rows.map((r) => [r.title, r.depth])).toEqual([
      ['재무', 0],
      ['결산서', 1],
      ['결산서', 1],
      ['인사', 0],
      ['명부', 1],
    ])
    expect(structureIssues(draft)).toEqual([])
  })

  it('문항 칸의 값(필수·안내)은 맨 아래 줄에만 붙는다', () => {
    const { valid } = parseBulkStructure('재무\t결산서\tY\tPDF로 주세요', LEVELS)
    const draft = appendBulkBranches(draftFromNodes([], LEVELS), valid)
    expect(draft.rows[0]).toMatchObject({ title: '재무', isRequired: false, guide: '' })
    expect(draft.rows[1]).toMatchObject({ title: '결산서', isRequired: true, guide: 'PDF로 주세요' })
  })

  it('세 단계도 경로를 따라 붙는다', () => {
    const levels = ['대분류', '중분류', '문항']
    const { valid } = parseBulkStructure('A\tB\t문항1\nA\tB\t문항2\nA\tC\t문항3', levels)
    const draft = appendBulkBranches(draftFromNodes([], levels), valid)
    expect(draft.rows.map((r) => [r.title, r.depth])).toEqual([
      ['A', 0],
      ['B', 1],
      ['문항1', 2],
      ['문항2', 2],
      ['C', 1],
      ['문항3', 2],
    ])
  })

  it('붙여 넣은 줄은 모두 새 줄이라 저장 전에는 원장 id가 없다', () => {
    const { valid } = parseBulkStructure('재무\t결산서', LEVELS)
    const draft = appendBulkBranches(draftFromNodes([], LEVELS), valid)
    expect(draft.rows.every((r) => r.nodeId === null)).toBe(true)
  })
})
