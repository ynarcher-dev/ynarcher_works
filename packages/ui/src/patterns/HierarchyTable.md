# 가로 계층 표

`HierarchyTable`은 품의 예산작성에서 사용하는 단계별 열, 상위 셀 병합,
가로 스크롤과 행 배치를 공유한다. 편집과 조회 화면 모두 같은 표를 호출한다.
금액 계산, 파일 업로드, 저장, 권한 확인은 호출하는 페이지가 담당한다.

## 사용

```tsx
import {
  HierarchyTable, HierarchyLevelFields, HierarchyNameInput,
  hierarchyGridGroups,
} from '@ynarcher/ui'

// 부모 다음에 자손이 오는 순서. id는 이름과 무관하게 고유해야 한다.
const nodes = [
  { id: 'financial', depth: 0, name: '재무 자료' },
  { id: 'statement', depth: 1, name: '재무제표', guide: '최근 3개년' },
]

<HierarchyLevelFields
  levels={levels}
  onCountChange={changeLevelCount}
  onNameChange={renameLevel}
/>
<HierarchyTable
  caption="받을 자료 구성"
  levels={levels}
  groups={hierarchyGridGroups(nodes)}
  columns={[{ key: 'guide', label: '안내' }]}
  renderHierarchyCell={(cell, level) => (
    <HierarchyNameInput
      levelLabel={levels[level]}
      value={nodes[cell.nodeIndex].name}
      onChange={(event) => renameNode(cell.nodeIndex, event.target.value)}
      onAdd={() => addSibling(cell.nodeIndex)}
    />
  )}
  renderCells={({ row }) => <td>{row.guide}</td>}
/>
```

`hierarchyGridGroups`는 노드의 위치와 부모 경로를 기준으로 병합한다.
동명 분류를 이름만으로 합치지 않는다. 깊이는 0부터 시작하며 한 번에 한 단계씩
깊어질 수 있다. 부모 ID 방식 데이터는 호출자가 먼저 깊이순으로 변환한다.
짧은 경로의 나머지 분류 열에는 빈 셀을 넣어 데이터 열의 위치를 유지한다.

단계 수 변경과 형제 가지 추가는 콜백으로 전달한다. 데이터 유실 확인, ID 생성,
하위 항목 생성 및 저장은 각 도메인의 규칙으로 처리한다. 공용 UI는 네트워크를 호출하지 않는다.

`renderCells`는 데이터 열의 `td`, `renderActions`는 관리 셀 안의 내용,
`renderGroupFooter`와 `footer`는 `tr`을 반환한다. 행 이동·삭제 버튼은
`HierarchyRowActions`로 공유하며 마지막 행 삭제 허용 여부도 호출자가 정한다.
조회 화면은 `mode="view"`와 읽기 전용 셀 렌더러를 사용한다.

품의 적용 예시는 `BudgetTreeInput.tsx`, `BudgetTreeView.tsx`를 참고한다.
파일받기는 부모 id 트리를 쓰는 예시다 — 깊이순 변환·폴더/문항 판정·단계 이름 저장은
`apps/works/src/features/program/fileCollection/structureDraft.ts`가 갖고, 화면 연결은
같은 폴더의 `CollectionStructureTab.tsx`에 있다. 단계 이름은 `file_collections.level_names`에
남고 저장은 도메인의 원자적 RPC 하나가 맡는다. 공용 표는 그 어느 쪽도 알지 못한다.
