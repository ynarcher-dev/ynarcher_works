import { Card, Radio, Select, cardText, cn, tableText } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { LeaveDayStrip } from '@/features/management/attendance/leave/LeaveDayStrip'
import { LeaveRequestList } from '@/features/management/attendance/leave/LeaveRequestList'
import type {
  LeaveDay,
  LeaveSelectMode,
} from '@/features/management/attendance/leave/leaveSelection'

/** 단계 번호(①②) — 무엇을 먼저 하는지가 이 화면의 절반이라 번호를 글자로 세운다. */
function StepMark({ no }: { no: number }) {
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-gray-100 text-caption font-semibold text-gray-600">
      {no}
    </span>
  )
}

/**
 * 한 단계 — 번호가 붙는 것은 **글줄뿐이고 내용은 카드 폭을 그대로 쓴다.**
 *
 * 내용까지 번호 오른쪽 칸에 넣으면 왼쪽에만 번호 칸(28px)만큼 들여쓰기가 생겨, 달력의 좌우
 * 여백이 어긋난다 — 화살표와 표 사이는 양쪽이 같은데 바깥이 다르니 표가 오른쪽으로 밀려 보인다.
 * 번호는 "무엇을 먼저 하는가"를 말하는 표식이지 내용의 폭을 정하는 열이 아니다.
 */
function Step({ no, head, children }: { no: number; head: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <StepMark no={no} />
        <div className="min-w-0 flex-1 space-y-1">{head}</div>
      </div>
      {children}
    </div>
  )
}

/** 범례 한 칸 — 색이 무엇을 뜻하는지는 달력 위에서 먼저 말한다. */
function LegendMark({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', tableText.meta)}>
      <span className={cn('inline-block size-3 rounded-radius-sm', swatch)} />
      {label}
    </span>
  )
}

interface LeaveDaySelectCardProps {
  typeOptions: string[]
  typeValue: string
  onTypeChange: (next: string) => void
  mode: LeaveSelectMode
  onModeChange: (next: LeaveSelectMode) => void
  days: LeaveDay[]
  selected: string[]
  rangeAnchor: string | null
  today: string
  onPick: (date: string) => void
  onPrev: () => void
  onNext: () => void
  onRemove: (date: string) => void
  onClearAll: () => void
}

/**
 * 휴가 사용일 선택 — 종류를 고르고(①) 달력에서 날을 집으면(②) 그 아래 신청 목록이 늘어난다.
 *
 * **잔여 일수는 자리만 세운다.** 연차 지급·소진 원장이 아직 없어 남은 일수를 답할 근거가
 * 없다(`hr_profiles`의 연차 칸은 어느 화면도 갱신하지 않는 죽은 값이다). 0으로 적지 않는
 * 이유도 같다 — 0일 남았다는 말과 모른다는 말은 다르다.
 *
 * 반차·반반차도 같은 이유로 아직 없다. 한 번 집은 날은 종일이며, 그 단위는 달력 칸이 아니라
 * 아래 목록의 줄이 적는다.
 */
export function LeaveDaySelectCard({
  typeOptions,
  typeValue,
  onTypeChange,
  mode,
  onModeChange,
  days,
  selected,
  rangeAnchor,
  today,
  onPick,
  onPrev,
  onNext,
  onRemove,
  onClearAll,
}: LeaveDaySelectCardProps) {
  return (
    <Card
      title="휴가 사용일 선택"
      help="휴가 종류를 고른 뒤 달력에서 날을 집습니다. 근무계획은 근태 기준(근무 요일)이 정하며, 휴무일과 이미 휴가가 잡힌 날은 고를 수 없습니다. 잔여 일수는 연차 원장 연동 후 표시됩니다."
    >
      <div className="space-y-5">
        <Step no={1} head={<p className={cardText.value}>휴가 종류를 선택하세요.</p>}>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="w-40"
              value={typeValue}
              onChange={(e) => onTypeChange(e.target.value)}
            >
              <option value="">휴가 종류</option>
              {typeOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
            {/* 남은 일수를 적을 자리. 값이 서기 전까지 왜 비어 있는지를 이 칸이 직접 말한다. */}
            <span
              className={cn(
                'rounded-radius-sm bg-gray-50 px-3 py-1.5',
                tableText.meta,
                'text-gray-500',
              )}
            >
              잔여 일수: — (연차 원장 연동 전)
            </span>
          </div>
        </Step>

        <Step
          no={2}
          head={
            <>
              <p className={cardText.value}>날짜 또는 기간을 선택하여 휴가 사용일을 선택하세요.</p>
              <p className={cn(tableText.meta, 'text-gray-500')}>
                방식 변경 시 이전에 선택한 내역은 초기화되며, 기간으로 선택 시 일차 선택만
                가능합니다.
              </p>
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-4">
            <Radio
              name="leave-select-mode"
              label="날짜 선택"
              checked={mode === 'DATES'}
              onChange={() => onModeChange('DATES')}
            />
            <Radio
              name="leave-select-mode"
              label="기간 선택"
              checked={mode === 'RANGE'}
              onChange={() => onModeChange('RANGE')}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-4">
            <LegendMark swatch="border border-gray-300 bg-gray-50" label="사용한 휴가" />
            <LegendMark swatch="bg-brand-600" label="선택한 날짜" />
          </div>

          {/* 첫 조회가 도착하기 전 — 빈 표를 그렸다 지우면 카드 높이가 한 번 튄다.
              달력이 설 만큼의 자리를 미리 비워 두고 값이 오면 그 자리에 그린다. */}
          {days.length === 0 ? (
            <div className="h-44 rounded-radius-md border border-gray-200 bg-gray-25" />
          ) : (
            <LeaveDayStrip
              days={days}
              selected={selected}
              today={today}
              rangeAnchor={rangeAnchor}
              onPick={onPick}
              onPrev={onPrev}
              onNext={onNext}
              disabled={!typeValue}
            />
          )}

          <LeaveRequestList
            selected={selected}
            typeLabel={typeValue}
            onRemove={onRemove}
            onClearAll={onClearAll}
          />
        </Step>
      </div>
    </Card>
  )
}
