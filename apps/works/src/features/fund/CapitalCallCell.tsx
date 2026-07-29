import { Input, Select } from '@ynarcher/ui'
import { CAPITAL_CALL_LP_STATUS_OPTIONS } from '@/features/fund/fundListHooks'

/** 상태별 셀 배경 — 표를 훑을 때 색만으로 납입/연체 분포가 읽히게 한다. */
const CELL_TINT: Record<string, string> = {
  PAID: 'bg-success-subtle/50',
  OVERDUE: 'bg-danger-subtle/60',
  NOTIFIED: 'bg-warning-subtle/60',
  SCHEDULED: '',
}

export function cellTint(status: string): string {
  return CELL_TINT[status] ?? ''
}

/**
 * 캐피탈 콜 매트릭스의 한 칸 — 그 차수에 그 LP가 낼 요청액 + 그 LP의 상태.
 * 상태가 입력 SSOT이고 납입액·납입일은 DB 트리거가 파생하므로, 화면에서 쓰는 값은 이 둘뿐이다.
 */
export function CapitalCallCell({
  requested,
  status,
  ariaLabel,
  onChange,
}: {
  requested: string
  status: string
  /** 스크린리더용 셀 식별(예: "OO조합 1차"). */
  ariaLabel: string
  onChange: (patch: { requested?: string; status?: string }) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Input
        inputMode="numeric"
        value={requested}
        onChange={(e) => onChange({ requested: e.target.value })}
        className="w-full text-right tabular-nums"
        density="table"
        placeholder="0"
        aria-label={`${ariaLabel} 요청액`}
      />
      {/* Select는 내부 래퍼가 w-full이라 폭 고정은 바깥 div가 맡는다. */}
      <div className="w-[5.75rem] shrink-0">
        <Select
          value={status}
          onChange={(e) => onChange({ status: e.target.value })}
          density="table"
          aria-label={`${ariaLabel} 상태`}
        >
          {CAPITAL_CALL_LP_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  )
}
