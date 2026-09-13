import { describe, expect, it } from 'vitest'
import { parseHiworksApprovalParticipants } from './hiworks-approval-lines.mjs'

/**
 * 합성 표본 — **원본 백업을 읽지 않습니다.**
 *
 * `hiworks_backup/`은 커밋 대상이 아니므로(`.gitignore`) CI 체크아웃에는 존재하지 않습니다.
 * 그 파일을 읽던 표본을 파서가 실제로 요구하는 구조만 남긴 **가상 인물 HTML**로 바꿉니다.
 * 실명은 쓰지 않되 검증하는 계약은 같습니다 — 결재(`first_line`)·재무합의(`third_line`)는
 * `역할/도장/이름` 3행 표, 참조(`fourth_line`)는 `refer-list` 스팬 나열이며, 구역 순서와
 * 구역 안 순서, 그리고 확인 도장이 없는 참조자와 있는 참조자가 갈리는 지점이 그대로입니다.
 *
 * 표본이 일부러 비워 둔 자리 둘: `천미르`의 도장 칸(이력 병합이 채웁니다)과 `남도현`의
 * 확인 이미지(끝까지 `null`로 남아야 합니다).
 */
function sampleDocument() {
  return {
    no: '9000001',
    user_name: '문서윤',
    position: '매니저',
    office_user_no: 90001,
    regdate: '2026-02-02 09:00:00',
    approval_line: {
      first_line: `
        <table>
          <tr><th>매니저</th><th>대표이사</th></tr>
          <tr>
            <td><img src="/img/big_stamp_approve.gif" title="2026-02-02 09:10:00"></td>
            <td><img src="/img/big_stamp_approve.gif" title="2026-02-03 14:20:00"></td>
          </tr>
          <tr><td>문서윤</td><td>한서정</td></tr>
        </table>
      `,
      third_line: `
        <table>
          <tr><th>회계팀</th><th>재무팀</th><th>경영지원</th></tr>
          <tr>
            <td><img src="/img/big_stamp_approve.gif" title="2026-02-04 09:05:00"></td>
            <td><img src="/img/big_stamp_approve.gif" title="2026-02-04 09:40:00"></td>
            <td></td>
          </tr>
          <tr><td>유하람</td><td>노경서</td><td>천미르</td></tr>
        </table>
      `,
      fourth_line: `
        <span class="refer-list" user_no="91001" node_id="n-1" type="user">서지완</span>
        <img src="/img/confirm_check.png" alt="확인" title="2026-02-04 10:00:00">
        <span class="refer-list" user_no="91002" node_id="n-2" type="user">남도현</span>
        <span class="refer-list" user_no="91003" node_id="n-3" type="user">곽예린</span>
        <span class="refer-list" user_no="91004" node_id="n-4" type="user">배시우</span>
        <span class="refer-list" user_no="91005" node_id="n-5" type="user">오하린</span>
        <img src="/img/confirm_check.png" alt="확인" title="2026-02-05 08:30:00">
        <span class="refer-list" user_no="91006" node_id="n-6" type="user">임태오</span>
        <span class="refer-list" user_no="91007" node_id="n-7" type="user">류가온</span>
      `,
    },
    comments_history: [
      { user_name: '천미르', title: '승인', comment: '', regdate: '2026-02-05 11:30:00' },
      { user_name: '장은결', title: '확인', comment: '', regdate: '2026-02-05 12:00:00' },
    ],
  }
}

describe('parseHiworksApprovalParticipants', () => {
  it('결재·재무합의·참조를 원본 구역과 순서대로 복원한다', () => {
    const participants = parseHiworksApprovalParticipants(sampleDocument())
    const names = (role) => participants
      .filter((person) => person.normalizedRole === role)
      .map((person) => person.name)

    expect(names('DRAFTER')).toEqual(['문서윤'])
    expect(names('APPROVER')).toEqual(['한서정'])
    expect(names('FINANCE_AGREEMENT')).toEqual(['유하람', '노경서', '천미르'])
    expect(names('CC')).toEqual(['서지완', '남도현', '곽예린', '배시우', '오하린', '임태오', '류가온'])
    expect(participants.find((person) => person.name === '남도현')?.normalizedDecision).toBeNull()
    expect(participants.find((person) => person.name === '오하린')?.normalizedDecision).toBe('CONFIRMED')
  })

  it('구역 순서가 결재 → 재무합의 → 참조로 고정된다', () => {
    const participants = parseHiworksApprovalParticipants(sampleDocument())

    expect(participants.map((person) => person.name)).toEqual([
      '문서윤', '한서정',
      '유하람', '노경서', '천미르',
      '서지완', '남도현', '곽예린', '배시우', '오하린', '임태오', '류가온',
    ])
    expect(participants.map((person) => person.section)).toEqual([
      'first_line', 'first_line',
      'third_line', 'third_line', 'third_line',
      ...Array.from({ length: 7 }, () => 'fourth_line'),
    ])
    expect(participants.filter((person) => person.section === 'fourth_line').map((person) => person.stepOrder))
      .toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('도장이 비어 있는 결재자만 이력이 채운다', () => {
    const participants = parseHiworksApprovalParticipants(sampleDocument())
    const person = (name) => participants.find((row) => row.name === name)

    // 도장이 없던 자리 — 이력의 '승인'이 시각과 결정을 모두 채운다.
    expect(person('천미르')?.decidedAt).toBe('2026-02-05 11:30:00')
    expect(person('천미르')?.normalizedDecision).toBe('APPROVED')
    // 이미 도장이 있던 자리는 이력이 덮어쓰지 않는다.
    expect(person('노경서')?.decidedAt).toBe('2026-02-04 09:40:00')
    expect(person('한서정')?.normalizedDecision).toBe('APPROVED')
    expect(person('오하린')?.decidedAt).toBe('2026-02-05 08:30:00')
    // 확인 이미지도 이력도 없는 참조자는 끝까지 비어 있다.
    expect(person('남도현')?.decidedAt).toBeNull()
    expect(person('남도현')?.sourceDecision).toBeNull()
  })

  it('결재선에 없는 확인 이력은 참여자를 새로 만들지 않는다', () => {
    const participants = parseHiworksApprovalParticipants({
      user_name: '기안자',
      position: '매니저',
      regdate: '2026-01-01 09:00:00',
      approval_line: {},
      comments_history: [
        { user_name: '열람자', title: '확인', comment: '', regdate: '2026-01-01 10:00:00' },
      ],
    })

    expect(participants.map((person) => person.name)).toEqual(['기안자'])
  })
})
