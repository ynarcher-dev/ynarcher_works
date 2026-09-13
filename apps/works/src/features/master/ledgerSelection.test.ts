import { describe, expect, it } from 'vitest'
import { creatorDeactivateSelection } from '@/features/master/ledgerSelection'

/**
 * 목록 선택 노출 규칙. 조회 결과가 아니라 **판정**만 본다 — 어떤 행이 내려왔는가는 원장과
 * RLS의 문제이고, 여기서 지킬 것은 "열은 언제 서고, 그 안에서 무엇을 고를 수 있는가" 둘이다.
 */

const row = (created_by: string | null) => ({ created_by })

describe('creatorDeactivateSelection', () => {
  it('쓰기 권한이 없으면 선택 열 자체가 서지 않는다', () => {
    const rule = creatorDeactivateSelection(false, 'u1')
    expect(rule.selectable).toBe(false)
    expect(rule.selectableRow(row('u1'))).toBe(false)
  })

  it('쓰기 권한이 있으면 내가 만든 행이 한 줄도 없어도 선택 열은 선다', () => {
    const rule = creatorDeactivateSelection(true, 'u1')
    const rows = [row('u2'), row('u3'), row(null)]
    expect(rule.selectable).toBe(true)
    expect(rows.some(rule.selectableRow)).toBe(false)
  })

  it('고를 수 있는 행은 생성자가 나인 행뿐이다(서버 트리거와 같은 조건)', () => {
    const rule = creatorDeactivateSelection(true, 'u1')
    expect(rule.selectableRow(row('u1'))).toBe(true)
    expect(rule.selectableRow(row('u2'))).toBe(false)
    expect(rule.selectableRow(row(null))).toBe(false)
  })

  it('로그인 사용자가 없으면 생성자 없는 행도 고를 수 없다', () => {
    expect(creatorDeactivateSelection(true, null).selectableRow(row(null))).toBe(false)
    expect(creatorDeactivateSelection(true, undefined).selectableRow(row(null))).toBe(false)
  })

  it('최고관리자는 생성자와 관계없이 모든 행을 고를 수 있다', () => {
    const rule = creatorDeactivateSelection(true, 'admin', true)
    expect(rule.selectableRow(row('u1'))).toBe(true)
    expect(rule.selectableRow(row(null))).toBe(true)
  })
})
