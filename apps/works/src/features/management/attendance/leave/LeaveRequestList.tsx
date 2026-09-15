import { Badge, IconButton, Radio, TextAction, cardText, cn, tableText } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { X } from 'lucide-react'
import { WEEKDAY_LABELS } from '@/features/management/attendance/attendanceModel'

interface LeaveRequestListProps {
  /** 달력에서 고른 날(YYYY-MM-DD). */
  selected: string[]
  /** 고른 휴가 종류 이름. 줄마다 무엇을 쓰는지 여기서 읽힌다. */
  typeLabel: string
  onRemove: (date: string) => void
  onClearAll: () => void
}

/**
 * 휴가 신청 목록 — 달력에서 고른 날이 **한 줄씩 늘어나는** 자리.
 *
 * 달력 칸은 색으로만 말하므로(글자를 적으면 좁은 칸에서 접힌다), 무슨 휴가를 어느 날 쓰는지는
 * 이 목록이 답한다. 창을 넘겨 달력 밖으로 나간 선택도 여기에는 그대로 남는다 — 3주 전 날을
 * 고른 채로 이번 주를 보고 있어도 자기가 무엇을 신청하는지 보여야 한다.
 *
 * 최근 날짜가 위에 선다(참조 화면과 같은 차례). 방금 집은 날이 목록 맨 위에 나타나 방금 한 일이
 * 어디에 반영됐는지 눈이 찾아다니지 않는다.
 *
 * **`시간` 단위는 아직 고를 수 없다.** 반차·반반차 기준은 근무 기준에 있지만 그 시간을 깎을 연차
 * 원장이 없어, 지금 고르게 하면 저장될 곳이 없는 값을 묻는 셈이 된다. 자리는 두고 잠가 둔다 —
 * 감추면 나중에 생길 선택지가 화면에 없는 기능처럼 보인다.
 */
export function LeaveRequestList({
  selected,
  typeLabel,
  onRemove,
  onClearAll,
}: LeaveRequestListProps) {
  const rows = [...selected].sort().reverse()

  return (
    <div className="space-y-3 border-t border-gray-200 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className={cardText.subhead}>휴가 신청</h3>
          <Badge tone="info">{`선택일수: ${rows.length}일`}</Badge>
        </div>
        {rows.length > 0 && (
          <TextAction onClick={onClearAll} className="text-gray-500 hover:text-gray-700">
            전체선택해제
          </TextAction>
        )}
      </div>

      {rows.length === 0 ? (
        <p className={cn(tableText.body, 'py-3 text-center text-gray-500')}>
          달력에서 고른 날이 여기에 한 줄씩 쌓입니다.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 border-t border-gray-200">
          {rows.map((date) => {
            const d = dayjs(date)
            return (
              <li key={date} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className={cn('min-w-0 flex-1', tableText.primary)}>
                  {`${date} (${WEEKDAY_LABELS[d.day()]})`}
                  {typeLabel ? ` - ${typeLabel}` : ''}
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  <Radio name={`leave-unit-${date}`} label="종일" checked readOnly />
                  <Radio
                    name={`leave-unit-${date}`}
                    label="시간"
                    checked={false}
                    disabled
                    readOnly
                    title="시간 단위 휴가는 연차 원장 연동 후 고를 수 있습니다."
                  />
                  <IconButton
                    icon={<X />}
                    label={`${date} 선택 해제`}
                    variant="ghost"
                    danger
                    onClick={() => onRemove(date)}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
