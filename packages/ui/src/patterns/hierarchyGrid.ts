/** 깊이순(부모 다음에 자손) 노드를 단계별 열과 병합 셀로 펼친다. 데이터 저장은 호출자가 맡는다. */
export interface HierarchyNode {
  id: string
  depth: number
}

export interface HierarchyGridCell {
  nodeIndex: number
  rowSpan: number
}

export interface HierarchyGridRow<T> {
  leafIndex: number
  row: T
  nodePath: number[]
  /** 앞 행의 병합 셀이 차지한 칸은 null. 경로보다 깊은 열은 빈 칸으로 표시한다. */
  cells: Array<HierarchyGridCell | null>
}

export interface HierarchyGridGroup<T> {
  rootIndex: number
  startIndex: number
  rows: HierarchyGridRow<T>[]
}

export function hierarchyGridRows<T extends HierarchyNode>(nodes: readonly T[]): HierarchyGridRow<T>[] {
  const paths: number[][] = []
  const stack: number[] = []
  for (const [index, node] of nodes.entries()) {
    if (!Number.isInteger(node.depth) || node.depth < 0 || node.depth > stack.length) {
      throw new Error('계층 노드는 0단계부터 시작하고 부모 다음에 자손이 와야 합니다.')
    }
    stack[node.depth] = index
    stack.length = node.depth + 1
    if ((nodes[index + 1]?.depth ?? -1) <= node.depth) paths.push([...stack])
  }

  return paths.map((path, rowIndex) => ({
    leafIndex: path[path.length - 1]!,
    row: nodes[path[path.length - 1]!]!,
    nodePath: path,
    cells: path.map((nodeIndex, level) => {
      if (rowIndex > 0 && paths[rowIndex - 1]?.[level] === nodeIndex) return null
      let rowSpan = 1
      while (paths[rowIndex + rowSpan]?.[level] === nodeIndex) rowSpan += 1
      return { nodeIndex, rowSpan }
    }),
  }))
}

export function hierarchyGridGroups<T extends HierarchyNode>(nodes: readonly T[]): HierarchyGridGroup<T>[] {
  const groups: HierarchyGridGroup<T>[] = []
  for (const [index, row] of hierarchyGridRows(nodes).entries()) {
    const rootIndex = row.nodePath[0]!
    const previous = groups[groups.length - 1]
    if (previous?.rootIndex === rootIndex) previous.rows.push(row)
    else groups.push({ rootIndex, startIndex: index, rows: [row] })
  }
  return groups
}
