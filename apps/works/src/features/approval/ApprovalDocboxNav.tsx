import { cn } from '@ynarcher/ui'
import type { LucideIcon } from 'lucide-react'
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
 * 문서함 내비게이션(좌측 열) — 임직원 정보의 조직 트리(OrgTreeNav)와 같은 자리 문법.
 * 하이웍스의 앱 사이드메뉴를 본문 좌패널로 옮긴 것이다.
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
    <aside className="w-60 shrink-0 border-r border-gray-200 pr-3">
      {/* 지금 손이 가야 할 문서(대기·확인·예정)가 맨 위에 선다 — 문서함을 열 때의 첫 질문은
          "내 문서가 어디 있나"보다 "지금 내가 처리할 게 있나"다. */}
      <NavGroup label={APPROVAL_PROGRESS_GROUP.label}>
        {APPROVAL_PROGRESS_GROUP.boxes.map((box) => (
          <NavRow
            key={box.key}
            label={box.label}
            icon={box.icon}
            count={progressCounts[box.key] ?? 0}
            countStyle="pending"
            selected={box.key === selectedProgress}
            onClick={() => onSelectProgress(box.key)}
          />
        ))}
      </NavGroup>

      {APPROVAL_BOX_GROUPS.map((group) => (
        <NavGroup key={group.label} label={group.label}>
          {group.boxes.map((box) => (
            <NavRow
              key={box.key}
              label={box.label}
              icon={box.icon}
              count={counts[box.key] ?? 0}
              selected={box.key === selectedBox}
              onClick={() => onSelectBox(box.key)}
            />
          ))}
        </NavGroup>
      ))}

      {/* 부서 문서함은 남의 문서까지 포함하는 가장 넓은 범위라 맨 아래에 선다. */}
      <NavGroup label={APPROVAL_DEPT_GROUP.label}>
        {APPROVAL_DEPT_GROUP.boxes.map((box) => (
          <NavRow
            key={box.key}
            label={box.label}
            icon={box.icon}
            count={counts[box.key] ?? 0}
            selected={box.key === selectedBox}
            onClick={() => onSelectBox(box.key)}
          />
        ))}
      </NavGroup>
    </aside>
  )
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-1 pl-1 text-caption font-semibold text-gray-500">{label}</p>
      {children}
    </div>
  )
}

/**
 * 행 규격은 임직원정보 조직 트리(OrgTreeNav.TreeRow)와 동일하게 맞춘다 — 좌측 24px 아이콘
 * 슬롯(w-icon-table) 뒤에 글자가 서는 리듬까지 같아야 두 화면의 좌패널이 한 부품으로 읽힌다.
 * 건수 열만 문서함의 추가분이다.
 */
function NavRow({
  label,
  icon: Icon,
  count,
  countStyle = 'plain',
  selected,
  onClick,
}: {
  label: string
  icon: LucideIcon
  count: number
  /**
   * 건수 표기 방식. 'pending'은 지금 손이 가야 할 건수(진행 중인 문서)라 `[3]` 말머리에
   * 붉은색으로 눈에 걸리게 두고, 'plain'은 보관 범위를 세는 숫자(내 문서함·부서 문서함)라
   * 그냥 숫자로 적는다 — 이쪽은 처리를 재촉하는 신호가 아니라 목록의 크기다.
   */
  countStyle?: 'pending' | 'plain'
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // 세로 여백은 **행**이 갖는다. 라벨 칸에만 py를 주면 라벨 상자(30px)와 건수 상자(18px)가
        // 달라져 두 글자가 같은 규격으로 서지 않는다 — 가운데 정렬로 가려지지만 글자마다
        // 상자가 다르면 정렬은 언제든 어긋난다.
        'group flex w-full items-center gap-1 rounded-radius-md py-1.5 pl-1 pr-1 text-left',
        selected ? 'bg-brand-25' : 'hover:bg-gray-50',
      )}
    >
      <span
        className={cn(
          'flex w-icon-table shrink-0 items-center justify-center',
          selected ? 'text-brand-700' : 'text-gray-500',
        )}
      >
        <Icon aria-hidden size={14} strokeWidth={1.8} />
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-body-sm',
          selected ? 'font-semibold text-brand-700' : 'text-gray-700 group-hover:text-gray-900',
        )}
      >
        {label}
      </span>
      {/* 건수 표기 — 0건만 회색으로 물러나는 규칙은 카드 제목 옆 건수(cardText.count)에서
          가져오되 **색과 굵기만** 가져온다. `[3]` 말머리와 붉은색은 처리를 재촉하는 신호라
          진행 중인 문서에만 붙이고, 내 문서함·부서 문서함은 그냥 숫자로 적는다(2026-08-26).

          크기는 그 토큰(14px)이 아니라 이 행의 크기(13px)를 쓴다. 그 값은 카드 제목(16px)
          옆에서 한 단 눌러 부속임을 드러내려고 정해진 것이라, 13px 메뉴 행에 그대로 얹으면
          눌리는 대신 라벨보다 커져 숫자가 메뉴명을 이긴다 — 한 줄 안에서 크기를 갈라 위계를
          만들지 않는다는 규칙에 어긋난다. 구분은 색(있음/없음)과 굵기가 이미 하고 있다.

          폭을 고정하고 오른쪽으로 맞춘다 — 폭을 내용에 맡기면 `[9]`와 `[10]`이 한 자리만큼
          어긋나 건수 열이 들쭉날쭉해진다(자릿수는 언제든 늘어난다). */}
      <span
        className={cn(
          'w-12 shrink-0 text-right text-body-sm font-semibold tabular-nums',
          count === 0
            ? 'text-gray-400'
            : countStyle === 'pending'
              ? 'text-danger-700'
              : 'text-gray-600',
        )}
      >
        {countStyle === 'pending' ? `[${count}]` : count}
      </span>
    </button>
  )
}
