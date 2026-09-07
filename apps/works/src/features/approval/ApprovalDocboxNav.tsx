import { SidePanelNav, SidePanelNavGroup, SidePanelNavRow } from '@ynarcher/ui'
import {
  APPROVAL_BOX_GROUPS,
  APPROVAL_DEPT_GROUP,
  APPROVAL_PROGRESS_GROUP,
  type ApprovalBoxKey,
  type ApprovalProgressKey,
} from '@/features/approval/config'

interface ApprovalDocboxNavProps {
  /** 현재 선택 문서함. 진행 필터가 켜져 있으면 null. */
  selectedBox: ApprovalBoxKey | null
  onSelectBox: (key: ApprovalBoxKey) => void
  counts: Record<ApprovalBoxKey, number>
  /** 현재 선택 진행 상태. 문서함이 선택돼 있으면 null. */
  selectedProgress: ApprovalProgressKey | null
  onSelectProgress: (key: ApprovalProgressKey) => void
  progressCounts: Record<ApprovalProgressKey, number>
}

/**
 * 문서함 내비게이션(좌측 열). 하이웍스의 앱 사이드메뉴를 본문 좌패널로 옮긴 것이다.
 *
 * 폭·경계·행 리듬은 `SidePanelNav`가 소유한다 — 이 화면이 그 규격의 원형이지만, 게시판·자료실·
 * 조직 트리가 같은 자리를 쓰므로 값은 부품이 갖고 여기는 **무엇을 세울지**만 정한다.
 *
 * 세 그룹이 서지만 **한 번에 하나만 선택된다** — 진행 중인 문서·내 문서함·부서 문서함은
 * 모두 "목록을 어떤 기준으로 좁히는가"라는 같은 축이라, 둘을 동시에 켜면 지금 보고 있는
 * 목록이 무엇으로 걸러진 것인지 답할 수 없다. 진행 그룹은 키 종류만 다를 뿐 같은 자리다
 * (2026-08-26 상단 현황 타일에서 이리로 옮겼다).
 *
 * 그룹 순서는 지금 할 일 → 내 것 → 부서 것(config의 APPROVAL_BOX_GROUPS 주석 참조).
 */
export function ApprovalDocboxNav({
  selectedBox,
  onSelectBox,
  counts,
  selectedProgress,
  onSelectProgress,
  progressCounts,
}: ApprovalDocboxNavProps) {
  return (
    <SidePanelNav>
      {/* 지금 손이 가야 할 문서(대기·확인·예정)가 맨 위에 선다 — 문서함을 열 때의 첫 질문은
          "내 문서가 어디 있나"보다 "지금 내가 처리할 게 있나"다. */}
      <SidePanelNavGroup label={APPROVAL_PROGRESS_GROUP.label}>
        {APPROVAL_PROGRESS_GROUP.boxes.map((box) => (
          <SidePanelNavRow
            key={box.key}
            label={box.label}
            icon={box.icon}
            count={progressCounts[box.key] ?? 0}
            countStyle="pending"
            selected={box.key === selectedProgress}
            onClick={() => onSelectProgress(box.key)}
          />
        ))}
      </SidePanelNavGroup>

      {APPROVAL_BOX_GROUPS.map((group) => (
        <SidePanelNavGroup key={group.label} label={group.label}>
          {group.boxes.map((box) => (
            <SidePanelNavRow
              key={box.key}
              label={box.label}
              icon={box.icon}
              count={counts[box.key] ?? 0}
              selected={box.key === selectedBox}
              onClick={() => onSelectBox(box.key)}
            />
          ))}
        </SidePanelNavGroup>
      ))}

      {/* 부서 문서함은 남의 문서까지 포함하는 가장 넓은 범위라 맨 아래에 선다. */}
      <SidePanelNavGroup label={APPROVAL_DEPT_GROUP.label}>
        {APPROVAL_DEPT_GROUP.boxes.map((box) => (
          <SidePanelNavRow
            key={box.key}
            label={box.label}
            icon={box.icon}
            count={counts[box.key] ?? 0}
            selected={box.key === selectedBox}
            onClick={() => onSelectBox(box.key)}
          />
        ))}
      </SidePanelNavGroup>
    </SidePanelNav>
  )
}
