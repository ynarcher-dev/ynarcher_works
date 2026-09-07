import { IconButton, Input, Select, cn, tableText } from '@ynarcher/ui'
import { X } from 'lucide-react'
import type { ProgramManagerDraft } from '@/features/program/hooks'
import type { StaffingPlacement } from '@/features/program/staffingPlacement'
import type { ProgramManagerSegment } from '@/features/program/staffingTypes'

/**
 * 담당자 행의 열 폭 — 머리글 한 줄과 모든 행이 **같은 값**을 나눠 쓴다.
 *
 * 값은 그 칸에 들어가는 것이 정한다(densityScale의 `columnWidth`와 같은 원리). 카드 밀도의
 * 컨트롤은 좌우 여백 12px, 셀렉트는 화살표 자리로 36px을 더 먹으므로 폭은 "글자 + 그 여백"으로
 * 잡아야 값이 잘리지 않는다 — 역할 셀렉트가 `w-28`보다 좁으면 `MEMBER`가 `MEMBEI`로 잘렸다.
 *
 * '부서' 열이 없어진 자리를 이름이 받는다(2026-09-06) — 이제 카드 자체가 부서이므로 행마다
 * 부서명을 되풀이할 이유가 없다.
 */
const col = {
  person: 'w-28',
  role: 'w-28',
  rate: 'w-16',
  date: 'w-32',
  /** 제거 버튼(아이콘 28px) 자리 — 머리글에서는 빈 칸으로 자리만 지킨다. */
  action: 'w-icon-card',
} as const

/**
 * 부서 카드 안의 담당자 표(머리글 + 구간 행들).
 *
 * 열 이름은 행마다 반복하지 않고 머리글 한 줄로 접는다 — 모든 행이 같은 칸을 갖는 표이므로,
 * 라벨을 행마다 다시 적으면 그 높이만큼 행이 부풀어 정작 값이 좁아진다.
 */
export function StaffingMemberRows({
  rows,
  placement,
  onPatch,
  onRemove,
}: {
  rows: ProgramManagerSegment[]
  placement: StaffingPlacement
  onPatch: (key: string, next: Partial<ProgramManagerSegment>) => void
  onRemove: (key: string) => void
}) {
  if (rows.length === 0) return null
  return (
    <>
      <div className={cn('flex items-center gap-2', tableText.head)}>
        <span className={cn(col.person, 'shrink-0')}>담당자</span>
        <span className={cn(col.role, 'shrink-0')}>역할</span>
        <span className={cn(col.rate, 'shrink-0')}>투입률</span>
        <span className={cn(col.date, 'shrink-0')}>시작일</span>
        <span className={cn(col.date, 'shrink-0')}>종료일</span>
        <span className="min-w-0 flex-1" aria-hidden />
        <span className={cn(col.action, 'shrink-0')} aria-hidden />
      </div>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row._key} className="flex items-center gap-2">
            <span className={cn(col.person, 'shrink-0 truncate', tableText.primary)}>
              {placement.nameOf(row.user_id)}
            </span>
            {/* Input·Select는 스스로 w-full 래퍼를 두므로 폭은 바깥 칸이 갖는다. */}
            <div className={cn(col.role, 'shrink-0')}>
              <Select
                aria-label="역할"
                value={row.role}
                onChange={(e) =>
                  onPatch(row._key, {
                    role: e.target.value as ProgramManagerDraft['role'],
                  })
                }
              >
                <option value="PM">PM</option>
                <option value="MEMBER">MEMBER</option>
              </Select>
            </div>
            <div className={cn(col.rate, 'shrink-0')}>
              <Input
                aria-label="투입률(%)"
                type="number"
                min={1}
                max={100}
                value={row.allocation_rate || ''}
                onChange={(e) =>
                  onPatch(row._key, {
                    allocation_rate: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                  })
                }
              />
            </div>
            <div className={cn(col.date, 'shrink-0')}>
              <Input
                aria-label="시작일"
                type="date"
                value={row.start_date}
                onChange={(e) => onPatch(row._key, { start_date: e.target.value })}
              />
            </div>
            <div className={cn(col.date, 'shrink-0')}>
              <Input
                aria-label="종료일"
                type="date"
                value={row.end_date}
                onChange={(e) => onPatch(row._key, { end_date: e.target.value })}
              />
            </div>
            <span className="min-w-0 flex-1" aria-hidden />
            <IconButton
              variant="ghost"
              danger
              className="shrink-0"
              label="구간 제거"
              onClick={() => onRemove(row._key)}
              icon={<X className="size-4" aria-hidden />}
            />
          </li>
        ))}
      </ul>
    </>
  )
}
