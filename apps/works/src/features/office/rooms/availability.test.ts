import { describe, expect, it } from 'vitest'
import {
  buildSlots,
  conflictsWith,
  isOpenOn,
  scheduleLabel,
  slotEndsAfter,
  slotStarts,
  type RoomSchedule,
} from '@/features/office/rooms/availability'

const schedule: RoomSchedule = {
  openTime: '09:00',
  closeTime: '11:00',
  slotMinutes: 30,
  weekdays: [1, 2, 3, 4, 5], // 월~금
}

// 2026-07-29는 수요일(getDay()=3), 2026-08-01은 토요일(6).
const wed = new Date('2026-07-29T00:00:00')
const sat = new Date('2026-08-01T00:00:00')

describe('availability 슬롯 계산', () => {
  it('운영시간을 슬롯 단위로 쪼갠다(자투리 제외)', () => {
    const slots = buildSlots(schedule, [])
    expect(slots.map((s) => s.start)).toEqual(['09:00', '09:30', '10:00', '10:30'])
    expect(slots.every((s) => !s.reserved)).toBe(true)
  })

  it('겹치는 예약 슬롯만 reserved로 표시한다(경계 접촉 제외)', () => {
    const slots = buildSlots(schedule, [{ start: '09:30', end: '10:00' }])
    expect(slots.find((s) => s.start === '09:00')?.reserved).toBe(false)
    expect(slots.find((s) => s.start === '09:30')?.reserved).toBe(true)
    expect(slots.find((s) => s.start === '10:00')?.reserved).toBe(false)
  })

  it('휴무 요일이면 빈 슬롯', () => {
    expect(isOpenOn(schedule, sat)).toBe(false)
    expect(buildSlots(schedule, [], sat)).toEqual([])
  })

  it('이용가능 시간·휴무일 라벨', () => {
    expect(scheduleLabel(schedule, wed)).toBe('이용가능 시간 (09:00 - 11:00)')
    expect(scheduleLabel(schedule, sat)).toBe('휴무일')
  })
})

describe('예약 폼 후보·검증', () => {
  it('시작 후보는 슬롯 시작, 종료 후보는 시작 이후 슬롯 경계', () => {
    expect(slotStarts(schedule)).toEqual(['09:00', '09:30', '10:00', '10:30'])
    expect(slotEndsAfter(schedule, '10:00')).toEqual(['10:30', '11:00'])
  })

  it('겹침 사전검증', () => {
    const existing = [{ start: '09:00', end: '09:30' }]
    expect(conflictsWith(existing, '09:00', '09:30')).toBe(true)
    expect(conflictsWith(existing, '09:30', '10:00')).toBe(false)
  })
})
