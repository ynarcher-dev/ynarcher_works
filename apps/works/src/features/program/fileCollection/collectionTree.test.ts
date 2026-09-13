import { describe, expect, it } from 'vitest'
import {
  collectDescendantIds,
  collectExpandableIds,
  findParentRowId,
  flattenCollectionTree,
  type CollectionTreeNode,
} from '@ynarcher/ui'

/**
 * 파일받기 폴더 트리의 줄 세우기 규칙.
 *
 * 화면(`CollectionTreeTable`)이 아니라 그 안의 순수 계산부를 검증한다. 특히 원장이 망가진
 * 경우(부모 유실·자기참조·순환)에 **멈추지 않고 줄을 세운다**는 것이 이 파일의 핵심이다 —
 * 트리는 사용자가 부모를 옮길 수 있는 구조라 그런 상태가 실제로 만들어질 수 있다.
 */

const node = (
  id: string,
  parent_id: string | null,
  sort_order: number,
  extra: Partial<CollectionTreeNode> = {},
): CollectionTreeNode => ({
  id,
  parent_id,
  title: extra.title ?? id,
  node_kind: extra.node_kind ?? 'FOLDER',
  sort_order,
  ...extra,
})

const ids = (rows: ReturnType<typeof flattenCollectionTree>) => rows.map((r) => r.node.id)

describe('flattenCollectionTree', () => {
  const tree: CollectionTreeNode[] = [
    node('b', null, 2),
    node('a', null, 1),
    node('a2', 'a', 2),
    node('a1', 'a', 1, { node_kind: 'QUESTION', is_required: true }),
    node('a1x', 'a1', 1, { node_kind: 'QUESTION' }),
  ]

  it('접힌 상태에서는 최상위만 sort_order 순으로 선다', () => {
    expect(ids(flattenCollectionTree(tree, []))).toEqual(['a', 'b'])
  })

  it('펼친 마디의 자식만 그 아래에 이어 붙는다', () => {
    expect(ids(flattenCollectionTree(tree, ['a']))).toEqual(['a', 'a1', 'a2', 'b'])
    expect(ids(flattenCollectionTree(tree, ['a', 'a1']))).toEqual(['a', 'a1', 'a1x', 'a2', 'b'])
  })

  it('깊이·경로·형제 위치를 함께 답한다', () => {
    const rows = flattenCollectionTree(tree, ['a', 'a1'])
    const deep = rows.find((r) => r.node.id === 'a1x')
    expect(deep?.depth).toBe(2)
    expect(deep?.path).toEqual(['a', 'a1', 'a1x'])
    expect(deep?.index).toBe(1)
    expect(deep?.siblingCount).toBe(1)
    const first = rows.find((r) => r.node.id === 'a1')
    expect(first?.siblingCount).toBe(2)
    expect(first?.hasChildren).toBe(true)
    expect(first?.childCount).toBe(1)
  })

  it('원본 부모 관계를 바꾸지 않는다', () => {
    const before = JSON.parse(JSON.stringify(tree))
    flattenCollectionTree(tree, ['a', 'a1'])
    expect(tree).toEqual(before)
  })

  it('임의 깊이(20단)도 세운다', () => {
    const deep: CollectionTreeNode[] = []
    for (let i = 0; i < 20; i += 1) {
      deep.push(node(`n${i}`, i === 0 ? null : `n${i - 1}`, 1))
    }
    const rows = flattenCollectionTree(deep, deep.map((n) => n.id))
    expect(rows).toHaveLength(20)
    expect(rows[19]?.depth).toBe(19)
    expect(rows[19]?.path).toHaveLength(20)
  })
})

describe('망가진 원장', () => {
  it('부모가 없는 줄은 감추지 않고 최상위로 올리며 표시를 남긴다', () => {
    const rows = flattenCollectionTree([node('root', null, 1), node('lost', 'gone', 2)], ['root'])
    expect(ids(rows)).toEqual(['root', 'lost'])
    expect(rows[1]?.depth).toBe(0)
    expect(rows[1]?.detached).toBe(true)
    expect(rows[0]?.detached).toBe(false)
  })

  it('자기 자신을 부모로 가리켜도 한 줄만 선다', () => {
    const rows = flattenCollectionTree([node('self', 'self', 1)], ['self'])
    expect(ids(rows)).toEqual(['self'])
    expect(rows[0]?.detached).toBe(true)
  })

  it('두 마디 순환에서 멈추고 두 줄 모두 남긴다', () => {
    const rows = flattenCollectionTree([node('a', 'b', 1), node('b', 'a', 2)], ['a', 'b'])
    expect(ids(rows).sort()).toEqual(['a', 'b'])
  })

  it('세 마디 순환에서도 모든 줄이 한 번씩만 선다', () => {
    const rows = flattenCollectionTree(
      [node('a', 'c', 1), node('b', 'a', 2), node('c', 'b', 3)],
      ['a', 'b', 'c'],
    )
    expect(ids(rows).sort()).toEqual(['a', 'b', 'c'])
    expect(new Set(ids(rows)).size).toBe(3)
  })

  it('순환으로 들어가는 길목의 정상 중첩은 그대로 남는다', () => {
    // a↔b가 고리이고 c는 b 밑의 멀쩡한 자식이다. 고리는 한 곳(a)만 끊으므로 b→c 중첩은 남는다.
    const rows = flattenCollectionTree(
      [node('a', 'b', 1), node('b', 'a', 2), node('c', 'b', 1)],
      ['a', 'b', 'c'],
    )
    expect(ids(rows)).toEqual(['a', 'b', 'c'])
    const c = rows.find((r) => r.node.id === 'c')
    expect(c?.detached).toBe(false)
    expect(c?.path.at(-2)).toBe('b')
    expect(rows.find((r) => r.node.id === 'b')?.detached).toBe(false)
  })

  it('같은 id가 두 번 오면 한 줄만 선다', () => {
    const rows = flattenCollectionTree(
      [node('a', null, 1, { title: '첫째' }), node('a', null, 2, { title: '둘째' })],
      [],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.node.title).toBe('첫째')
  })

  it('빈 원장은 빈 목록이다', () => {
    expect(flattenCollectionTree([], [])).toEqual([])
  })
})

describe('보조 함수', () => {
  const tree: CollectionTreeNode[] = [
    node('a', null, 1),
    node('a1', 'a', 1),
    node('a1x', 'a1', 1, { node_kind: 'QUESTION' }),
    node('b', null, 2, { node_kind: 'QUESTION' }),
  ]

  it('collectExpandableIds는 자식이 있는 마디만 고른다', () => {
    expect(collectExpandableIds(tree).sort()).toEqual(['a', 'a1'])
  })

  it('collectDescendantIds는 자기 자신을 빼고 모든 자손을 준다', () => {
    expect(collectDescendantIds(tree, 'a').sort()).toEqual(['a1', 'a1x'])
    expect(collectDescendantIds(tree, 'b')).toEqual([])
  })

  it('collectDescendantIds는 순환에서도 멈춘다', () => {
    const cyclic = [node('a', 'b', 1), node('b', 'a', 2), node('c', 'b', 1)]
    expect(collectDescendantIds(cyclic, 'b').sort()).toEqual(['c'])
  })

  it('findParentRowId는 보이는 줄에서 상위 줄을 찾는다', () => {
    const rows = flattenCollectionTree(tree, ['a', 'a1'])
    expect(findParentRowId(rows, 0)).toBeUndefined()
    expect(findParentRowId(rows, 1)).toBe('a')
    expect(findParentRowId(rows, 2)).toBe('a1')
  })
})
