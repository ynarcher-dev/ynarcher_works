import { describe, expect, it } from 'vitest'
import {
  ATTENDANCE_REQUEST_ABBREVS,
  WORK_REQUEST_FIELD_KEYS,
  isAttendanceRequestForm,
  workRequestFieldValues,
  workRequestKindOf,
  workRequestMinutes,
  workRequestTitle,
} from '@/features/approval/workRequestForm'

describe('workRequestMinutes', () => {
  it('같은 날 안의 구간은 그 차이를 분으로 답한다', () => {
    expect(workRequestMinutes('18:00', '19:30')).toBe(90)
  })

  it('끝이 시작보다 이르면 자정을 넘긴 근무로 읽는다', () => {
    expect(workRequestMinutes('22:00', '01:00')).toBe(180)
  })

  it('휴게시간은 잰 시간에서 뺀다', () => {
    expect(workRequestMinutes('09:00', '18:00', 60)).toBe(480)
  })

  it('휴게를 빼고 0분 이하가 되면 값이 없다', () => {
    expect(workRequestMinutes('09:00', '10:00', 60)).toBeNull()
  })

  it('같은 시각 두 개는 하루가 아니라 값 없음이다', () => {
    expect(workRequestMinutes('18:00', '18:00')).toBeNull()
  })

  it('형식이 어긋나면 값이 없다', () => {
    expect(workRequestMinutes('', '19:00')).toBeNull()
    expect(workRequestMinutes('25:00', '26:00')).toBeNull()
  })
})

describe('workRequestTitle', () => {
  it('종류·근무일·시각으로 세운다', () => {
    expect(
      workRequestTitle({ kind: 'OVERTIME', date: '2026-09-15', start: '18:00', end: '19:00' }),
    ).toBe('연장근무 신청 2026-09-15 18:00~19:00')
  })

  it('날짜가 없으면 종류만 적는다', () => {
    expect(workRequestTitle({ kind: 'HOLIDAY', date: '', start: '', end: '' })).toBe(
      '휴일근무 신청',
    )
  })
})

describe('workRequestFieldValues', () => {
  it('연장근무는 휴게시간을 갖지 않는다(값으로도 0이다)', () => {
    const values = workRequestFieldValues({
      kind: 'OVERTIME',
      date: '2026-09-15',
      start: '18:00',
      end: '20:00',
      breakMinutes: 30,
      reason: '  마감 대응  ',
    })
    expect(values[WORK_REQUEST_FIELD_KEYS.breakMinutes]).toBe('0')
    expect(values[WORK_REQUEST_FIELD_KEYS.minutes]).toBe('120')
    expect(values[WORK_REQUEST_FIELD_KEYS.reason]).toBe('마감 대응')
  })

  it('휴일근무는 휴게시간을 빼고 신청 시간을 적는다', () => {
    const values = workRequestFieldValues({
      kind: 'HOLIDAY',
      date: '2026-09-19',
      start: '09:00',
      end: '18:00',
      breakMinutes: 60,
      reason: '',
    })
    expect(values[WORK_REQUEST_FIELD_KEYS.minutes]).toBe('480')
  })

  it('시간을 계산할 수 없으면 빈칸으로 둔다(0으로 적지 않는다)', () => {
    const values = workRequestFieldValues({
      kind: 'OVERTIME',
      date: '2026-09-15',
      start: '',
      end: '',
      breakMinutes: 0,
      reason: '',
    })
    expect(values[WORK_REQUEST_FIELD_KEYS.minutes]).toBe('')
  })
})

describe('양식 가르기', () => {
  it('근태 신청 3종은 기안 화면 목록에서 빠진다', () => {
    expect(ATTENDANCE_REQUEST_ABBREVS).toEqual(['휴가', '연장', '휴일'])
    expect(isAttendanceRequestForm({ abbrev: '휴가' })).toBe(true)
    expect(isAttendanceRequestForm({ abbrev: '연장' })).toBe(true)
    expect(isAttendanceRequestForm({ abbrev: '지결' })).toBe(false)
    expect(isAttendanceRequestForm(null)).toBe(false)
  })

  it('주소의 request 값이 신청 종류를 정한다', () => {
    expect(workRequestKindOf('overtime')).toBe('OVERTIME')
    expect(workRequestKindOf('holiday')).toBe('HOLIDAY')
    // 휴가는 자기 화면(LeaveRequestEditor)이 받으므로 근무 신청이 아니다.
    expect(workRequestKindOf('leave')).toBeNull()
    expect(workRequestKindOf(null)).toBeNull()
  })
})
