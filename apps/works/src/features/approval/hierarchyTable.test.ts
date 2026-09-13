import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HierarchyTable, hierarchyGridGroups, hierarchyGridRows } from '@ynarcher/ui'

// 예산과 관계없는 데이터도 같은 표를 쓸 수 있어야 한다.
const nodes = [
  { id: 'a', depth: 0, title: '공통' },
  { id: 'a1', depth: 1, title: '증빙' },
  { id: 'a2', depth: 1, title: '증빙' },
  { id: 'b', depth: 0, title: '공통' },
  { id: 'b1', depth: 1, title: '증빙' },
]

describe('공용 가로 계층 표', () => {
  it('동명 분류를 합치지 않고 실제 부모를 기준으로 병합한다', () => {
    const groups = hierarchyGridGroups(nodes)
    expect(groups.map((group) => [group.rootIndex, group.startIndex, group.rows.length]))
      .toEqual([[0, 0, 2], [3, 2, 1]])
    expect(groups[0]!.rows[0]!.cells).toEqual([
      { nodeIndex: 0, rowSpan: 2 }, { nodeIndex: 1, rowSpan: 1 },
    ])
    expect(groups[0]!.rows[1]!.cells[0]).toBeNull()
    expect(groups[1]!.rows[0]!.cells[0]).toEqual({ nodeIndex: 3, rowSpan: 1 })
    expect(groups.flatMap((group) => group.rows.map((row) => row.row.id))).toEqual(['a1', 'a2', 'b1'])
  })

  it('깊이가 다른 경로도 모든 데이터 열의 위치를 유지한다', () => {
    const mixed = [nodes[0]!, nodes[1]!, { id: 'b', depth: 0, title: '단독' }]
    const html = renderToStaticMarkup(createElement(HierarchyTable<typeof mixed[number]>, {
      caption: '자료 구성', levels: ['분류', '항목'], groups: hierarchyGridGroups(mixed),
      columns: [{ key: 'guide', label: '안내' }], mode: 'view',
      renderHierarchyCell: (cell) => mixed[cell.nodeIndex]!.title,
      renderCells: (row) => createElement('td', null, `${row.row.id} 안내`),
    }))
    const dataRows = [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].slice(1)
    expect(dataRows).toHaveLength(2)
    expect(dataRows.map((row) => [...row[1]!.matchAll(/<td\b/g)].length)).toEqual([3, 3])
    expect(html).toContain('단독</td><td')
    expect(html).toContain('<caption class="sr-only">자료 구성</caption>')
  })

  it('행 조작과 소계·합계를 호출자가 제공할 수 있다', () => {
    const indexes: number[] = []
    const html = renderToStaticMarkup(createElement(HierarchyTable<typeof nodes[number]>, {
      caption: '문항', levels: ['분류', '항목'], groups: hierarchyGridGroups(nodes), columns: [],
      renderHierarchyCell: (cell) => nodes[cell.nodeIndex]!.title,
      renderCells: () => null,
      renderActions: (_, index) => { indexes.push(index); return createElement('button', null, '삭제') },
      renderGroupFooter: () => createElement('tr', null, createElement('td', { colSpan: 3 }, '소계')),
      footer: createElement('tr', null, createElement('td', { colSpan: 3 }, '합계')),
    }))
    expect(indexes).toEqual([0, 1, 2])
    expect(html.match(/rowspan="2"/gi)).toHaveLength(1)
    expect(html.match(/>소계</g)).toHaveLength(2)
    expect(html.match(/>합계</g)).toHaveLength(1)
  })

  it('빈 표와 잘못된 깊이를 명시적으로 처리한다', () => {
    expect(hierarchyGridRows([])).toEqual([])
    expect(() => hierarchyGridRows([{ id: 'x', depth: 1 }])).toThrow()
    expect(() => hierarchyGridRows([{ id: 'x', depth: 0 }, { id: 'y', depth: 2 }])).toThrow()
    const html = renderToStaticMarkup(createElement(HierarchyTable, {
      caption: '빈 표', levels: ['분류', '항목'], groups: [], columns: [{ key: 'file', label: '파일' }],
      renderHierarchyCell: () => null, renderCells: () => null,
      renderActions: () => null, emptyContent: '분류 추가',
    }))
    expect(html).toMatch(/colspan="4"/i)
    expect(html).toContain('분류 추가')
  })
})
