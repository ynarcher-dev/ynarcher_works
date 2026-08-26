import { cn } from '@ynarcher/ui'
import { APPROVAL_BOX_GROUPS, type ApprovalBoxKey } from '@/features/approval/config'

interface ApprovalDocboxNavProps {
  /** 현재 선택 문서함. 진행 중 타일 필터가 켜져 있으면 null(문서함 비선택 상태). */
  selected: ApprovalBoxKey | null
  onSelect: (key: ApprovalBoxKey) => void
  /** 문서함별 건수. */
  counts: Record<ApprovalBoxKey, number>
}

/**
 * 문서함 내비게이션(좌측 열) — 임직원 정보의 조직 트리(OrgTreeNav)와 같은 자리 문법.
 * 하이웍스의 앱 사이드메뉴를 본문 좌패널로 옮긴 것이며, '진행 중인 문서' 그룹은
 * 여기 두지 않고 상단 현황 타일이 담당한다(같은 분류를 두 곳에 두면 어느 쪽이
 * 기준인지 흐려진다).
 */
export function ApprovalDocboxNav({ selected, onSelect, counts }: ApprovalDocboxNavProps) {
  return (
    <aside className="w-60 shrink-0 border-r border-gray-200 pr-3">
      {APPROVAL_BOX_GROUPS.map((group) => (
        <div key={group.label} className="mb-4">
          <p className="mb-1 pl-1 text-caption font-semibold text-gray-500">{group.label}</p>
          {group.boxes.map(({ key, label, icon: Icon }) => {
            const isSelected = key === selected
            return (
              // 행 규격은 임직원정보 조직 트리(OrgTreeNav.TreeRow)와 동일하게 맞춘다 —
              // 좌측 24px 아이콘 슬롯(w-icon-table) 뒤에 글자가 서는 리듬까지 같아야
              // 두 화면의 좌패널이 한 부품으로 읽힌다. 건수 열만 문서함의 추가분이다.
              <button
                key={key}
                type="button"
                onClick={() => onSelect(key)}
                className={cn(
                  'group flex w-full items-center gap-1 rounded-radius-md pl-1 pr-1 text-left',
                  isSelected ? 'bg-brand-25' : 'hover:bg-gray-50',
                )}
              >
                <span
                  className={cn(
                    'flex w-icon-table shrink-0 items-center justify-center',
                    isSelected ? 'text-brand-700' : 'text-gray-500',
                  )}
                >
                  <Icon aria-hidden size={14} strokeWidth={1.8} />
                </span>
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate py-1.5 text-body-sm',
                    isSelected
                      ? 'font-semibold text-brand-700'
                      : 'text-gray-700 group-hover:text-gray-900',
                  )}
                >
                  {label}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-caption tabular-nums',
                    isSelected ? 'text-brand-700' : 'text-gray-500',
                  )}
                >
                  {counts[key] ?? 0}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </aside>
  )
}
