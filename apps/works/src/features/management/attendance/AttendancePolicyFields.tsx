import { Input, Switch } from '@ynarcher/ui'
import type { AttendancePolicyInput } from '@/features/management/attendance/attendanceConfigApi'
import { WEEKDAY_LABELS, workMinutesText } from '@/features/management/attendance/attendanceModel'

interface Props {
  value: AttendancePolicyInput
  onChange: (v: AttendancePolicyInput) => void
}

/**
 * 근무 기준 입력 필드 묶음 — 전사 기본과 임직원별 예외가 같은 폼을 쓴다.
 *
 * 값의 뜻을 라벨이 아니라 배치가 말하게 둔다: 출근 가능 시간대는 한 줄에 붙여 놓고 뒤 값이
 * 지각선임을 캡션으로 밝히며, 소정 근무시간은 그것이 만드는 결과(퇴근 가능 시각)를 바로 아래
 * 적는다. 숫자만 두면 "9시간이 어디서부터 9시간인가"를 매번 되묻게 된다.
 */
export function AttendancePolicyFields({ value, onChange }: Props) {
  const set = <K extends keyof AttendancePolicyInput>(k: K, v: AttendancePolicyInput[K]) =>
    onChange({ ...value, [k]: v })

  const toggleDay = (d: number) => {
    const next = value.workdays.includes(d)
      ? value.workdays.filter((x) => x !== d)
      : [...value.workdays, d].sort()
    set('workdays', next)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <span className="text-caption text-gray-600">출근 가능 시간</span>
        <div className="flex items-center gap-2">
          <Input
            type="time"
            className="w-32"
            value={value.checkInFrom.slice(0, 5)}
            onChange={(e) => set('checkInFrom', e.target.value)}
          />
          <span className="text-body text-gray-500">~</span>
          <Input
            type="time"
            className="w-32"
            value={value.checkInTo.slice(0, 5)}
            onChange={(e) => set('checkInTo', e.target.value)}
          />
        </div>
        <p className="text-caption text-gray-500">
          뒤 시각({value.checkInTo.slice(0, 5)})을 넘겨 찍으면 지각으로 판정합니다.
        </p>
      </div>

      <div className="space-y-1">
        <span className="text-caption text-gray-600">소정 근무시간</span>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="w-24"
            min={1}
            max={24}
            step={0.5}
            value={value.workMinutes / 60}
            onChange={(e) => {
              const hours = Number(e.target.value)
              if (Number.isFinite(hours)) set('workMinutes', Math.round(hours * 60))
            }}
          />
          <span className="text-body text-gray-500">시간</span>
        </div>
        <p className="text-caption text-gray-500">
          퇴근 가능 시각 = 출근 시각 + {workMinutesText(value.workMinutes)}. 그 전에 퇴근하면
          조기퇴근으로 판정합니다.
        </p>
      </div>

      <div className="space-y-1">
        <span className="text-caption text-gray-600">근무 요일</span>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_LABELS.map((label, d) => {
            const on = value.workdays.includes(d)
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggleDay(d)}
                aria-pressed={on}
                className={
                  'h-ctl-card w-10 rounded-radius-md border text-body-sm transition-colors duration-fast ' +
                  (on
                    ? 'border-brand bg-brand/10 font-semibold text-brand'
                    : 'border-gray-300 bg-white text-gray-500 hover:border-gray-400')
                }
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-body text-gray-900">외부근무 허용</p>
          <p className="text-caption text-gray-500">
            끄면 근무체크에서 근무지를 고를 수 없고 사내 근무로만 기록됩니다.
          </p>
        </div>
        <Switch
          checked={value.allowExternal}
          onChange={(on) => set('allowExternal', on)}
          aria-label="외부근무 허용"
        />
      </div>

      <div className="space-y-1">
        <span className="text-caption text-gray-600">적용 시작일</span>
        <Input
          type="date"
          className="w-44"
          value={value.effectiveFrom}
          onChange={(e) => set('effectiveFrom', e.target.value)}
        />
        <p className="text-caption text-gray-500">
          이 날짜부터 적용됩니다. 이전 날짜의 판정은 그때의 기준을 그대로 유지합니다.
        </p>
      </div>
    </div>
  )
}
