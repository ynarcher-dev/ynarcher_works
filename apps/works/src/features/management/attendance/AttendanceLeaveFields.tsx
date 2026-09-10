import { Input, Tooltip, tooltipScale } from '@ynarcher/ui'
import type { AttendancePolicyInput } from '@/features/management/attendance/attendanceConfigApi'
import { minutesBetween, workMinutesText } from '@/features/management/attendance/attendanceModel'

interface Props {
  value: AttendancePolicyInput
  onChange: (v: AttendancePolicyInput) => void
}

interface SpanProps {
  label: string
  help: string
  from: string
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
}

/**
 * 쉬는 구간 한 줄 — 오전 반차와 오후 반차가 같은 규격으로 선다.
 *
 * 구간의 길이를 뒤에 적는 이유는 고른 값의 결과가 곧바로 읽혀야 하기 때문이다. 시각 두 개만
 * 두면 '09:00~14:00이 몇 시간인가'를 매번 손으로 세게 된다.
 */
function Span({ label, help, from, to, onFrom, onTo }: SpanProps) {
  const minutes = minutesBetween(from, to)

  return (
    <div className="space-y-1">
      <span className="text-caption text-gray-600">
        {label}
        <Tooltip label={label} content={help} className={tooltipScale.gap} />
      </span>
      <div className="flex items-center gap-2">
        <Input
          type="time"
          className="w-32"
          value={from.slice(0, 5)}
          onChange={(e) => onFrom(e.target.value)}
        />
        <span className="text-body text-gray-500">~</span>
        <Input
          type="time"
          className="w-32"
          value={to.slice(0, 5)}
          onChange={(e) => onTo(e.target.value)}
        />
        <span className="text-caption text-gray-500">
          {minutes > 0 ? workMinutesText(minutes) : '시작이 종료보다 늦습니다'}
        </span>
      </div>
    </div>
  )
}

/**
 * 연차 기준 — 반차·반반차가 하루의 어디를 비우는가.
 *
 * **반차는 길이가 아니라 시각 구간으로 받는다.** 길이만 두면 오전 반차를 쓴 사람의 출근
 * 기준선을 세울 수 없다(오후에 출근한 사람이 아침 지각선에 걸려 전원 지각으로 찍힌다).
 * 구간으로 받으면 오전 반차의 출근선은 구간의 끝, 오후 반차의 퇴근선은 구간의 시작으로
 * 절대 시각이 곧바로 선다.
 *
 * **반반차만 길이(분)다.** 쉬는 자리가 하루 중 어디로도 갈 수 있어 구간으로 고정할 수 없고,
 * 기준은 '그날의 소정 근무시간에서 이만큼을 뺀다' 하나로 충분하다.
 */
export function AttendanceLeaveFields({ value, onChange }: Props) {
  const set = <K extends keyof AttendancePolicyInput>(k: K, v: AttendancePolicyInput[K]) =>
    onChange({ ...value, [k]: v })

  return (
    <div className="space-y-4">
      <Span
        label="오전 반차"
        help={'이 구간은 근무하지 않습니다.\n종료 시각이 그날의 출근 기준선이 됩니다.'}
        from={value.halfAmStart}
        to={value.halfAmEnd}
        onFrom={(v) => set('halfAmStart', v)}
        onTo={(v) => set('halfAmEnd', v)}
      />

      <Span
        label="오후 반차"
        help={'이 구간은 근무하지 않습니다.\n시작 시각이 그날의 퇴근 기준선이 됩니다.'}
        from={value.halfPmStart}
        to={value.halfPmEnd}
        onFrom={(v) => set('halfPmStart', v)}
        onTo={(v) => set('halfPmEnd', v)}
      />

      <div className="space-y-1">
        <span className="text-caption text-gray-600">
          반반차
          <Tooltip
            label="반반차"
            content={
              `그날의 소정 근무시간에서 ${workMinutesText(value.quarterMinutes)}을 뺍니다.\n` +
              '쉬는 자리가 하루 중 어디로도 갈 수 있어 시각이 아니라 길이로 정합니다.'
            }
            className={tooltipScale.gap}
          />
        </span>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="w-24"
            min={0.5}
            max={8}
            step={0.5}
            value={value.quarterMinutes / 60}
            onChange={(e) => {
              const hours = Number(e.target.value)
              if (Number.isFinite(hours)) set('quarterMinutes', Math.round(hours * 60))
            }}
          />
          <span className="text-body text-gray-500">시간</span>
        </div>
      </div>
    </div>
  )
}
