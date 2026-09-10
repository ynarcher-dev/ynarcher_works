import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseHiworksApprovalParticipants } from './hiworks-approval-lines.mjs'

function sampleDocuments() {
  const path = fileURLToPath(new URL('../hiworks_backup/data/data.js', import.meta.url))
  const raw = readFileSync(path, 'utf8')
  return JSON.parse(raw.replace(/^\s*HIWORKS_DATA\s*=\s*/, '').replace(/;?\s*$/, ''))
}

describe('parseHiworksApprovalParticipants', () => {
  it('3915291의 결재·재무합의·참조를 원본 구역과 순서대로 복원한다', () => {
    const document = sampleDocuments().find((row) => row.no === '3915291')
    const participants = parseHiworksApprovalParticipants(document)
    const names = (role) => participants
      .filter((person) => person.normalizedRole === role)
      .map((person) => person.name)

    expect(names('DRAFTER')).toEqual(['홍완기'])
    expect(names('APPROVER')).toEqual(['김민주'])
    expect(names('FINANCE_AGREEMENT')).toEqual(['김지연', '오정란', '조민주'])
    expect(names('CC')).toEqual(['이강현', '박수희', '정연재', '안소희', '김하나', '배관용', '박정아'])
    expect(participants.find((person) => person.name === '박수희')?.normalizedDecision).toBeNull()
    expect(participants.find((person) => person.name === '김하나')?.normalizedDecision).toBe('CONFIRMED')
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
