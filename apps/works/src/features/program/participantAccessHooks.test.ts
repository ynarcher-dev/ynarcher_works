import { describe, expect, it } from 'vitest'
import { countNotified } from '@/features/program/participantAccessHooks'

/**
 * 재설정 안내 집계. guest-password-reset은 발송이 실패해도 200 `{ ok: true, notified: false }`로
 * 답하므로, 호출 성공을 발송으로 세면 한 통도 안 나간 일괄이 "n건을 보냈습니다"가 된다.
 */

const fulfilled = (notified?: boolean): PromiseSettledResult<{ notified?: boolean }> => ({
  status: 'fulfilled',
  value: { notified },
})
const rejected: PromiseSettledResult<{ notified?: boolean }> = {
  status: 'rejected',
  reason: new Error('boom'),
}

describe('countNotified', () => {
  it('notified가 참인 것만 발송으로 센다', () => {
    expect(countNotified([fulfilled(true), fulfilled(true)])).toEqual({ sent: 2, failed: 0 })
  })

  it('성공 응답이어도 notified가 false면 실패다', () => {
    expect(countNotified([fulfilled(false), fulfilled(false)])).toEqual({ sent: 0, failed: 2 })
  })

  it('notified 칸이 아예 없는 응답도 실패로 센다', () => {
    expect(countNotified([fulfilled(undefined)])).toEqual({ sent: 0, failed: 1 })
  })

  it('거절된 호출은 실패다', () => {
    expect(countNotified([rejected, rejected])).toEqual({ sent: 0, failed: 2 })
  })

  it('섞여 있으면 각각 제 몫으로 갈린다', () => {
    expect(countNotified([fulfilled(true), fulfilled(false), rejected])).toEqual({
      sent: 1,
      failed: 2,
    })
  })

  it('대상이 없으면 둘 다 0이다', () => {
    expect(countNotified([])).toEqual({ sent: 0, failed: 0 })
  })
})
