import { SidePanelNav, SidePanelNavEmpty, SidePanelNavGroup, SidePanelNavRow } from '@ynarcher/ui'
import { Megaphone } from 'lucide-react'
import { boardIcon } from '@/features/hub/boardIcons'
import { NOTICE_TAB } from '@/features/hub/boardPostStore'
import { BOARD_KIND_LABEL, type BoardDef, type BoardKind } from '@/features/hub/boardStore'

interface BoardSectionNavProps {
  kind: BoardKind
  boards: BoardDef[]
  selectedKey?: string
  onSelect: (key: string) => void
}

/**
 * 게시판·자료실의 2차 내비게이션. 규격은 전자결재 문서함과 같은 `SidePanelNav`가 소유한다.
 * 레지스트리 항목이 늘어나도 OFFICE 1차 사이드바는 한 줄로 유지되고 이 패널만 길어진다.
 */
export function BoardSectionNav({ kind, boards, selectedKey, onSelect }: BoardSectionNavProps) {
  const label = BOARD_KIND_LABEL[kind]

  return (
    <SidePanelNav>
      <SidePanelNavGroup label={label}>
        {kind === 'POST' && (
          <SidePanelNavRow
            label="공지사항"
            icon={Megaphone}
            selected={selectedKey === NOTICE_TAB}
            onClick={() => onSelect(NOTICE_TAB)}
          />
        )}
        {boards.length > 0 ? (
          boards.map((board) => (
            <SidePanelNavRow
              key={board.id}
              label={board.label}
              icon={boardIcon(board.icon)}
              selected={board.slug === selectedKey}
              onClick={() => onSelect(board.slug)}
            />
          ))
        ) : kind === 'ARCHIVE' ? (
          // 게시판(POST)은 공지사항이 고정 항목으로 서 있어 빈 줄을 두지 않는다.
          <SidePanelNavEmpty>등록된 {label}이 없습니다.</SidePanelNavEmpty>
        ) : null}
      </SidePanelNavGroup>
    </SidePanelNav>
  )
}
