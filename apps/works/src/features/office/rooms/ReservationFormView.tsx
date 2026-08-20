import { Button, Field, Input, Select, formText } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import {
  conflictsWith,
  isOpenOn,
  slotEndsAfter,
  slotStarts,
  type ReservationSpan,
} from '@/features/office/rooms/availability'
import { roomSchedule, type MeetingRoom } from '@/features/office/rooms/meetingRoomsApi'

interface Props {
  room: MeetingRoom
  /** 카드에서 선택된 날짜(YYYY-MM-DD) — 폼 초기값. */
  initialDate: string
  /** initialDate 기준 이 회의실의 예약(사전 겹침 검사용). */
  spans: ReservationSpan[]
  busy: boolean
  onCancel: () => void
  onSubmit: (v: { date: string; startTime: string; endTime: string }) => void
}

/**
 * 예약 폼(레퍼런스 이미지2에서 기업명·회의명·예약번호 제거).
 * 날짜 · 시작 · 종료만 입력한다. 슬롯 후보·요일 휴무·겹침을 클라이언트에서 사전 검증하고,
 * 최종 정합·중복은 서버(트리거·EXCLUDE)가 강제한다.
 */
export function ReservationFormView({
  room,
  initialDate,
  spans,
  busy,
  onCancel,
  onSubmit,
}: Props) {
  const schedule = roomSchedule(room)
  const starts = useMemo(() => slotStarts(schedule), [schedule])

  const [date, setDate] = useState(initialDate)
  const [start, setStart] = useState(starts[0] ?? '')
  const ends = useMemo(() => slotEndsAfter(schedule, start), [schedule, start])
  const [end, setEnd] = useState(ends[0] ?? '')
  const [err, setErr] = useState('')

  // 시작을 바꾸면 종료 후보를 재계산해 유효 범위로 보정한다.
  const onStartChange = (next: string) => {
    setStart(next)
    const nextEnds = slotEndsAfter(schedule, next)
    setEnd(nextEnds[0] ?? '')
    setErr('')
  }

  const dayOpen = isOpenOn(schedule, dayjs(date).toDate())
  const today = dayjs().format('YYYY-MM-DD')

  const submit = () => {
    if (!date) return setErr('날짜를 선택하세요.')
    if (date < today) return setErr('지난 날짜는 예약할 수 없습니다.')
    if (!dayOpen) return setErr('선택한 날짜는 예약할 수 없는 요일입니다.')
    if (!start || !end) return setErr('시작·종료 시간을 선택하세요.')
    if (end <= start) return setErr('종료가 시작보다 빨라요.')
    // 카드와 같은 날짜일 때만 로컬 겹침 사전검사(다른 날짜는 서버가 강제).
    if (date === initialDate && conflictsWith(spans, start, end)) {
      return setErr('이미 예약된 시간대입니다.')
    }
    setErr('')
    onSubmit({ date, startTime: start, endTime: end })
  }

  return (
    <div className="space-y-4">
      <Field label="날짜">
        {/* 지난 날짜는 고를 수 없다(최종 검증은 submit·서버가 한다). */}
        <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="시작 시간">
          <Select value={start} onChange={(e) => onStartChange(e.target.value)}>
            {starts.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="종료 시간">
          <Select value={end} onChange={(e) => setEnd(e.target.value)}>
            {ends.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {!dayOpen && (
        <p className={formText.error}>선택한 요일은 예약할 수 없습니다.</p>
      )}
      {err && <p className={formText.error}>{err}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          목록으로 돌아가기
        </Button>
        <Button onClick={submit} disabled={busy || !dayOpen}>
          {busy ? '처리 중…' : '예약 확인'}
        </Button>
      </div>
    </div>
  )
}
