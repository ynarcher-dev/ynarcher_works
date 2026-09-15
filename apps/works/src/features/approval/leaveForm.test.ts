import { describe, expect, it } from 'vitest'
import type { ApprovalForm } from '@/features/approval/approvalApi'
import type { FormField } from '@/features/approval/fields'
import {
  LEAVE_FIELD_KEYS,
  findLeaveForm,
  isLeaveForm,
  leaveFieldValues,
  leaveTypeOptions,
} from '@/features/approval/leaveForm'

const form = (over: Partial<ApprovalForm>): ApprovalForm => ({
  id: 'f1',
  name: '휴가신청서',
  category: '내부문서',
  abbrev: '휴가',
  retention: '영구',
  security_grade: 'A등급',
  is_active: true,
  sort_order: 406,
  current_version_id: 'v1',
  current_version: { id: 'v1', version_no: 1, fields: [] },
  budget_link: 'NONE',
  ...over,
})

describe('isLeaveForm / findLeaveForm', () => {
  it('약칭으로 휴가신청서를 가린다(이름이 바뀌어도 찾는다)', () => {
    expect(isLeaveForm(form({ name: '휴가원' }))).toBe(true)
    expect(isLeaveForm(form({ abbrev: '일반' }))).toBe(false)
    expect(isLeaveForm(null)).toBe(false)
  })

  it('비활성 양식은 새 신청에 쓰지 않는다', () => {
    expect(findLeaveForm([form({ is_active: false })])).toBeNull()
    expect(findLeaveForm([form({ abbrev: '일반' }), form({ id: 'f2' })])?.id).toBe('f2')
  })
})

describe('leaveTypeOptions', () => {
  const fields: FormField[] = [
    { key: LEAVE_FIELD_KEYS.type, label: '휴가 구분', type: 'SELECT', options: ['연차', '반차'] },
  ]

  it('양식이 가진 선택지를 쓴다', () => {
    expect(leaveTypeOptions(fields, ['경조'])).toEqual(['연차', '반차'])
  })

  it('양식에 선택지가 없으면 근태 상태 원장으로 물러난다', () => {
    const empty: FormField[] = [
      { key: LEAVE_FIELD_KEYS.type, label: '휴가 구분', type: 'SELECT', options: [] },
    ]
    expect(leaveTypeOptions(empty, ['경조'])).toEqual(['경조'])
    expect(leaveTypeOptions([], ['경조'])).toEqual(['경조'])
  })
})

describe('leaveFieldValues', () => {
  it('고른 날의 처음·끝·일수를 칸으로 옮긴다', () => {
    const values = leaveFieldValues({
      type: '연차',
      dates: ['2026-09-22', '2026-09-21'],
      reason: '개인 사유',
      listDates: false,
    })
    expect(values[LEAVE_FIELD_KEYS.type]).toBe('연차')
    expect(values[LEAVE_FIELD_KEYS.start]).toBe('2026-09-21')
    expect(values[LEAVE_FIELD_KEYS.end]).toBe('2026-09-22')
    expect(values[LEAVE_FIELD_KEYS.days]).toBe('2')
    expect(values[LEAVE_FIELD_KEYS.reason]).toBe('개인 사유')
  })

  it('끊긴 선택은 사용일을 사유에 함께 적는다', () => {
    const values = leaveFieldValues({
      type: '연차',
      dates: ['2026-09-21', '2026-09-25'],
      reason: '개인 사유',
      listDates: true,
    })
    expect(values[LEAVE_FIELD_KEYS.reason]).toBe('개인 사유\n사용일: 2026-09-21, 2026-09-25')
  })

  it('사유가 비어 있어도 사용일만 남는다', () => {
    const values = leaveFieldValues({
      type: '연차',
      dates: ['2026-09-21', '2026-09-25'],
      reason: '   ',
      listDates: true,
    })
    expect(values[LEAVE_FIELD_KEYS.reason]).toBe('사용일: 2026-09-21, 2026-09-25')
  })

  it('아무 날도 고르지 않으면 날짜 칸은 빈 값이다', () => {
    const values = leaveFieldValues({ type: '', dates: [], reason: '', listDates: false })
    expect(values[LEAVE_FIELD_KEYS.start]).toBe('')
    expect(values[LEAVE_FIELD_KEYS.end]).toBe('')
    expect(values[LEAVE_FIELD_KEYS.days]).toBe('0')
  })
})
