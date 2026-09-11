import { describe, expect, it } from 'vitest'
import { minuteLinkDisplayColumns } from '@/features/office/minutes/minuteLinks'
import { toStartupRepresentativeLink } from '@/features/office/minutes/startupRepresentativeSearch'

describe('toStartupRepresentativeLink', () => {
  it('STARTUP id를 가리키고 대표자명·기업명을 표시값으로 둔다', () => {
    expect(
      toStartupRepresentativeLink({
        id: 'startup-1',
        companyName: '아처랩',
        representative: '홍길동',
      }),
    ).toEqual({
      targetType: 'startup',
      targetId: 'startup-1',
      role: 'EXTERNAL_ATTENDEE',
      label: '홍길동',
      code: '아처랩',
    })
  })

  it('다시 열 때도 참석자는 대표자명/기업명, 관련 업무는 기업명으로 읽는다', () => {
    expect(minuteLinkDisplayColumns('startup', 'EXTERNAL_ATTENDEE')).toEqual({
      titleColumn: 'representative',
      codeColumn: 'name',
    })
    expect(minuteLinkDisplayColumns('startup', 'SUBJECT')).toEqual({
      titleColumn: 'name',
      codeColumn: null,
    })
  })
})
