import { describe, expect, it } from 'vitest'
import { addUnlinkedAttendee } from '@/features/office/minutes/networkPeopleSearch'

describe('addUnlinkedAttendee', () => {
  it('NETWORKS에 없어도 정리한 표기를 회의록 명단에 남긴다', () => {
    expect(addUnlinkedAttendee([], '  홍길동 / 스타트업A  ')).toEqual(['홍길동 / 스타트업A'])
  })

  it('공백과 같은 표기의 중복은 새 참석자로 만들지 않는다', () => {
    const current = ['홍길동 / 스타트업A']
    expect(addUnlinkedAttendee(current, ' 홍길동 / 스타트업A ')).toBe(current)
    expect(addUnlinkedAttendee(current, '   ')).toBe(current)
  })

  it('소속이 다른 동명이인은 서로 다른 참석자로 보존한다', () => {
    expect(addUnlinkedAttendee(['홍길동 / 스타트업A'], '홍길동 / 스타트업B')).toEqual([
      '홍길동 / 스타트업A',
      '홍길동 / 스타트업B',
    ])
  })
})
