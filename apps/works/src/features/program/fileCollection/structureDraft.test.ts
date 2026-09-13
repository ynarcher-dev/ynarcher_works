import { describe, expect, it } from 'vitest'
import type { FileCollectionNodeDto } from '@ynarcher/master-data'
import {
  addSiblingBranch,
  appendRootBranch,
  canMoveGridRow,
  completeBranch,
  draftFromNodes,
  isEmptyFolderRow,
  isStructureDirty,
  levelCountBlocker,
  moveGridRow,
  orphanNodeIds,
  removeGridRow,
  resizeLevelNames,
  rowNodeType,
  setLevelCount,
  setRowGuide,
  setRowRequired,
  setRowTitle,
  structureChanges,
  structureDeletes,
  structureIssues,
  structurePayload,
  structureSignature,
  type StructureDraft,
} from '@/features/program/fileCollection/structureDraft'

/**
 * 파일받기 구성 초안의 순수 계산부.
 *
 * 여기서 지키려는 것 다섯이다 — (1) 부모 id 트리가 격자의 깊이순 목록으로 정확히 펴지는가,
 * (2) 단계를 늘려도 **기존 문항의 id와 값이 그대로 마지막 단계에 붙어 있는가**,
 * (3) 단계를 줄일 때 마디를 조용히 잃지 않는가, (4) 이름이 같아도 가지가 합쳐지지 않는가,
 * (5) 저장 페이로드가 서버 계약(부모가 먼저·잎은 문항·삭제는 명시)을 그대로 지키는가.
 */

const node = (
  id: string,
  parent: string | null,
  type: 'FOLDER' | 'QUESTION',
  title: string,
  sort = 1,
  extra: Partial<FileCollectionNodeDto> = {},
): FileCollectionNodeDto => ({
  id,
  collection_id: 'col',
  parent_id: parent,
  node_type: type,
  title,
  guide: null,
  is_required: false,
  sort_order: sort,
  updated_at: `2026-09-13T00:00:0${sort}.000Z`,
  ...extra,
})

/** 폴더 하나 아래 문항 둘. 2단계 트리. */
const TWO_LEVEL: FileCollectionNodeDto[] = [
  node('f1', null, 'FOLDER', '재무'),
  node('q1', 'f1', 'QUESTION', '재무제표', 1, { is_required: true, guide: '최근 3개년' }),
  node('q2', 'f1', 'QUESTION', '주주명부', 2),
]

describe('부모 id 트리 → 깊이순 목록', () => {
  it('부모 다음에 자손이 오고 깊이가 붙는다', () => {
    const draft = draftFromNodes(TWO_LEVEL, [])
    expect(draft.rows.map((r) => [r.nodeId, r.depth])).toEqual([
      ['f1', 0],
      ['q1', 1],
      ['q2', 1],
    ])
  })

  it('저장된 단계 이름이 없으면 깊이만큼 기본 이름을 세운다', () => {
    expect(draftFromNodes(TWO_LEVEL, []).levels).toEqual(['대분류', '문항'])
    expect(draftFromNodes([], []).levels).toEqual(['문항'])
  })

  it('저장된 단계 이름이 실제 깊이보다 짧으면 깊이를 따른다(옛 트리를 자르지 않는다)', () => {
    const deep = [...TWO_LEVEL, node('q3', 'q2', 'QUESTION', '더 깊은 문항')]
    expect(draftFromNodes(deep, ['분류', '문항']).levels).toHaveLength(3)
  })

  it('들쭉날쭉한 옛 트리를 그대로 세운다(최상위 문항과 깊은 가지가 함께)', () => {
    const ragged = [...TWO_LEVEL, node('q9', null, 'QUESTION', '최상위 문항', 2)]
    const draft = draftFromNodes(ragged, [])
    expect(draft.rows.map((r) => r.nodeId)).toEqual(['f1', 'q1', 'q2', 'q9'])
    expect(draft.rows.find((r) => r.nodeId === 'q9')?.depth).toBe(0)
    expect(structureIssues(draft)).toEqual([])
  })

  it('부모를 찾지 못한 마디도 버리지 않고 최상위로 세운다', () => {
    const orphan = [node('q7', 'missing', 'QUESTION', '길 잃은 문항')]
    expect(draftFromNodes(orphan, []).rows.map((r) => r.nodeId)).toEqual(['q7'])
    expect(orphanNodeIds(orphan)).toEqual(['q7'])
  })
})

describe('단계 수 바꾸기', () => {
  it('늘리면 기존 문항 앞에 빈 분류가 서고 문항의 신원은 그대로다', () => {
    const draft = setLevelCount(draftFromNodes(TWO_LEVEL, []), 3)
    expect(draft.levels).toHaveLength(3)

    const q1 = draft.rows.find((r) => r.nodeId === 'q1')!
    expect(q1.depth).toBe(2)
    expect(q1.title).toBe('재무제표')
    expect(q1.guide).toBe('최근 3개년')
    expect(q1.isRequired).toBe(true)
    expect(q1.updatedAt).toBe(TWO_LEVEL[1]!.updated_at)

    // 문항마다 자기 앞에 빈 분류가 하나씩 선다(새 줄이므로 원장 id가 없다).
    const blanks = draft.rows.filter((r) => r.nodeId === null)
    expect(blanks).toHaveLength(2)
    expect(blanks.every((r) => r.depth === 1 && r.title === '')).toBe(true)
    expect(draft.rows.map((r) => r.nodeId)).toEqual(['f1', null, 'q1', null, 'q2'])
  })

  it('늘린 뒤 페이로드에서도 문항의 id·값이 마지막 단계에 그대로 붙어 있다', () => {
    const draft = setLevelCount(draftFromNodes(TWO_LEVEL, []), 3)
    const payload = structurePayload(draft)
    const q1 = payload.find((item) => item.node_id === 'q1')!
    expect(q1.node_type).toBe('QUESTION')
    expect(q1.is_required).toBe(true)
    expect(q1.guide).toBe('최근 3개년')
    // 새 분류가 부모가 되고, 그 분류의 부모는 원래 폴더다.
    const parent = payload.find((item) => item.key === q1.parent_key)!
    expect(parent.node_id).toBeNull()
    expect(parent.node_type).toBe('FOLDER')
    expect(payload.find((item) => item.key === parent.parent_key)?.node_id).toBe('f1')
  })

  it('빈 분류의 이름이 비어 있으면 저장을 막는다', () => {
    const draft = setLevelCount(draftFromNodes(TWO_LEVEL, []), 3)
    expect(structureIssues(draft)).toContain('이름이 비어 있는 칸이 있습니다.')
  })

  it('늘린 것은 되돌릴 수 있다(빈 통로만 걷어낸다)', () => {
    const grown = setLevelCount(draftFromNodes(TWO_LEVEL, []), 3)
    expect(levelCountBlocker(grown, 2)).toBeNull()
    const back = setLevelCount(grown, 2)
    expect(back.rows.map((r) => [r.nodeId, r.depth])).toEqual([
      ['f1', 0],
      ['q1', 1],
      ['q2', 1],
    ])
    expect(isStructureDirty(structureChanges(TWO_LEVEL, [], back))).toBe(false)
  })

  it('원장에 있는 마디가 걸리면 줄이지 않고 이유를 말한다', () => {
    const draft = draftFromNodes(TWO_LEVEL, [])
    const reason = levelCountBlocker(draft, 1)
    expect(reason).toContain('재무제표')
    expect(setLevelCount(draft, 1)).toBe(draft)
  })

  it('단계 이름은 사람이 고친 것만 지킨다', () => {
    expect(resizeLevelNames(['대분류', '문항'], 3)).toEqual(['대분류', '중분류', '문항'])
    expect(resizeLevelNames(['회계', '문항'], 3)).toEqual(['회계', '중분류', '문항'])
    expect(resizeLevelNames(['회계', '서류'], 1)).toEqual(['회계'])
  })

  it('단계 수에 상한을 두지 않는다(깊은 옛 트리도 저장할 수 있다)', () => {
    let nodes: FileCollectionNodeDto[] = []
    for (let i = 0; i < 12; i += 1) {
      nodes = [
        ...nodes,
        node(`n${i}`, i === 0 ? null : `n${i - 1}`, i === 11 ? 'QUESTION' : 'FOLDER', `${i}단`),
      ]
    }
    const draft = draftFromNodes(nodes, [])
    expect(draft.levels).toHaveLength(12)
    expect(structureIssues(draft)).toEqual([])
  })
})

describe('빈 폴더', () => {
  const withEmptyFolder = [...TWO_LEVEL, node('f2', null, 'FOLDER', '빈 묶음', 2)]

  it('빈 폴더는 문항으로 바뀌지 않는다', () => {
    const draft = draftFromNodes(withEmptyFolder, [])
    const index = draft.rows.findIndex((r) => r.nodeId === 'f2')
    expect(rowNodeType(draft.rows, index)).toBe('FOLDER')
    expect(isEmptyFolderRow(draft, index)).toBe(true)
    expect(structurePayload(draft).find((i) => i.node_id === 'f2')?.node_type).toBe('FOLDER')
  })

  it('단계를 늘려도 빈 폴더는 제자리에 남는다', () => {
    const draft = setLevelCount(draftFromNodes(withEmptyFolder, []), 3)
    expect(draft.rows.find((r) => r.nodeId === 'f2')?.depth).toBe(0)
  })

  it('가지 완성으로 그 아래 문항을 세운다', () => {
    const draft = draftFromNodes(withEmptyFolder, [])
    const index = draft.rows.findIndex((r) => r.nodeId === 'f2')
    const next = completeBranch(draft, index)
    const added = next.rows[index + 1]!
    expect(added.nodeId).toBeNull()
    expect(added.depth).toBe(1)
    expect(rowNodeType(next.rows, index)).toBe('FOLDER')
    expect(rowNodeType(next.rows, index + 1)).toBe('QUESTION')
  })
})

describe('줄 조작', () => {
  it('형제 가지는 자기 자손 뒤에 서고 마지막 단계까지 이어진다', () => {
    const draft = addSiblingBranch(draftFromNodes(TWO_LEVEL, []), 0)
    expect(draft.rows.map((r) => [r.nodeId, r.depth])).toEqual([
      ['f1', 0],
      ['q1', 1],
      ['q2', 1],
      [null, 0],
      [null, 1],
    ])
  })

  it('최상위 줄 추가는 표 끝에 한 가지를 세운다', () => {
    const draft = appendRootBranch(draftFromNodes([], ['대분류', '문항']))
    expect(draft.rows.map((r) => r.depth)).toEqual([0, 1])
  })

  it('한 줄을 지우면 마지막 자식을 잃은 상위도 함께 빠진다', () => {
    const draft = draftFromNodes(TWO_LEVEL, [])
    const one = removeGridRow(draft, 0)
    expect(one.rows.map((r) => r.nodeId)).toEqual(['f1', 'q2'])
    const none = removeGridRow(one, 0)
    expect(none.rows).toEqual([])
  })

  it('지운 줄은 삭제 목록에 오르고 남은 줄은 오르지 않는다', () => {
    const draft = removeGridRow(draftFromNodes(TWO_LEVEL, []), 0)
    expect(structureDeletes(TWO_LEVEL, draft)).toEqual([
      { node_id: 'q1', expected_updated_at: TWO_LEVEL[1]!.updated_at },
    ])
  })

  it('형제 순서를 바꾼다(끝에서는 움직이지 않는다)', () => {
    const draft = draftFromNodes(TWO_LEVEL, [])
    expect(canMoveGridRow(draft, 0, -1)).toBe(false)
    expect(canMoveGridRow(draft, 0, 1)).toBe(true)
    const moved = moveGridRow(draft, 0, 1)
    expect(moved.rows.map((r) => r.nodeId)).toEqual(['f1', 'q2', 'q1'])
  })
})

describe('저장 페이로드', () => {
  it('부모는 언제나 자기보다 앞에 서고 잎만 문항이다', () => {
    const payload = structurePayload(draftFromNodes(TWO_LEVEL, []))
    const keys = payload.map((item) => item.key)
    payload.forEach((item, index) => {
      if (item.parent_key === null) return
      expect(keys.indexOf(item.parent_key)).toBeLessThan(index)
    })
    expect(payload.map((item) => item.node_type)).toEqual(['FOLDER', 'QUESTION', 'QUESTION'])
  })

  it('기존 마디는 id와 기준 시각을 함께 싣고 새 줄은 둘 다 비운다', () => {
    const payload = structurePayload(addSiblingBranch(draftFromNodes(TWO_LEVEL, []), 0))
    const existing = payload.find((item) => item.node_id === 'q1')!
    expect(existing.expected_updated_at).toBe(TWO_LEVEL[1]!.updated_at)
    const created = payload.filter((item) => item.node_id === null)
    expect(created.every((item) => item.expected_updated_at === null)).toBe(true)
  })

  it('이름이 같은 형제도 서로 다른 줄로 남는다(이름으로 합치지 않는다)', () => {
    let draft = addSiblingBranch(draftFromNodes(TWO_LEVEL, []), 0)
    draft = setRowTitle(draft, 3, '재무')
    draft = setRowTitle(draft, 4, '재무제표')
    const payload = structurePayload(draft)
    expect(payload.filter((item) => item.title === '재무')).toHaveLength(2)
    expect(new Set(payload.map((item) => item.key)).size).toBe(payload.length)
    expect(payload.filter((item) => item.title === '재무').map((i) => i.node_id)).toEqual([
      'f1',
      null,
    ])
  })

  it('폴더에는 필수 표시가 실리지 않는다', () => {
    const draft = setRowRequired(draftFromNodes(TWO_LEVEL, []), 0, true)
    expect(structurePayload(draft)[0]!.is_required).toBe(false)
  })

  it('빈 안내는 null로 실린다', () => {
    const draft = setRowGuide(draftFromNodes(TWO_LEVEL, []), 1, '   ')
    expect(structurePayload(draft)[1]!.guide).toBeNull()
  })
})

describe('변경 감지', () => {
  const draft = (): StructureDraft => draftFromNodes(TWO_LEVEL, ['대분류', '문항'])

  it('아무것도 고치지 않으면 저장할 것이 없다', () => {
    const changes = structureChanges(TWO_LEVEL, ['대분류', '문항'], draft())
    expect(changes).toEqual({ created: 0, updated: 0, deleted: 0, levelsChanged: false })
    expect(isStructureDirty(changes)).toBe(false)
  })

  it('저장된 단계 이름이 없어도 화면이 세운 기본 이름은 변경으로 세지 않는다', () => {
    // 옛 파일받기를 열었다는 이유만으로 저장 버튼이 켜지면, 사람이 아무것도 하지 않았는데
    // 화면이 서버 값을 따라가지 못한다. 기본 이름은 다른 변경과 함께 실려 저장된다.
    expect(structureChanges(TWO_LEVEL, [], draftFromNodes(TWO_LEVEL, [])).levelsChanged).toBe(false)
  })

  it('사람이 단계 이름을 고치면 변경으로 센다', () => {
    const renamed = draftFromNodes(TWO_LEVEL, [])
    expect(
      structureChanges(TWO_LEVEL, [], { ...renamed, levels: ['회계', '문항'] }).levelsChanged,
    ).toBe(true)
  })

  it('이름·필수·안내·순서·삭제를 각각 센다', () => {
    expect(structureChanges(TWO_LEVEL, ['대분류', '문항'], setRowTitle(draft(), 1, '바뀐 이름')).updated).toBe(1)
    expect(structureChanges(TWO_LEVEL, ['대분류', '문항'], setRowRequired(draft(), 2, true)).updated).toBe(1)
    expect(structureChanges(TWO_LEVEL, ['대분류', '문항'], setRowGuide(draft(), 2, '메모')).updated).toBe(1)
    // 순서 바꾸기는 두 줄의 자리가 함께 달라진다.
    expect(structureChanges(TWO_LEVEL, ['대분류', '문항'], moveGridRow(draft(), 0, 1)).updated).toBe(2)
    expect(structureChanges(TWO_LEVEL, ['대분류', '문항'], removeGridRow(draft(), 0)).deleted).toBe(1)
    expect(structureChanges(TWO_LEVEL, ['대분류', '문항'], addSiblingBranch(draft(), 0)).created).toBe(2)
  })

  it('지문은 값·자리·기준 시각이 달라질 때만 달라진다', () => {
    const same = structureSignature([...TWO_LEVEL].reverse(), ['대분류', '문항'])
    expect(structureSignature(TWO_LEVEL, ['대분류', '문항'])).toBe(same)
    expect(structureSignature(TWO_LEVEL, ['대분류'])).not.toBe(same)
    expect(
      structureSignature([...TWO_LEVEL.slice(0, 2), node('q2', 'f1', 'QUESTION', '이름 바뀜', 2)], [
        '대분류',
        '문항',
      ]),
    ).not.toBe(same)
  })
})

describe('마지막 열의 빈 폴더', () => {
  it('가지 완성이 열을 함께 늘려 새 문항이 보이게 한다', () => {
    // 1단계짜리 옛 파일받기에 빈 폴더 하나만 있는 경우.
    const only = [node('f9', null, 'FOLDER', '묶음만 있음')]
    const draft = draftFromNodes(only, [])
    expect(draft.levels).toHaveLength(1)

    const next = completeBranch(draft, 0)
    expect(next.levels).toEqual(['대분류', '문항'])
    expect(next.rows.map((r) => [r.nodeId, r.depth])).toEqual([
      ['f9', 0],
      [null, 1],
    ])
    expect(rowNodeType(next.rows, 1)).toBe('QUESTION')
    // 새로 선 줄은 마지막 열 안에 있다 — 표에 그릴 칸이 있다는 뜻이다.
    expect(next.rows[1]!.depth).toBeLessThanOrEqual(next.levels.length - 1)
  })
})
