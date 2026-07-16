import { describe, expect, it } from 'vitest'
import { nextLevel, WORKSPACE_KEYS } from '@/features/admin/config'

describe('nextLevel (ADMIN 권한 토글 매트릭스)', () => {
  it('읽기 토글 on/off', () => {
    expect(nextLevel('none', 'read', true)).toBe('read')
    expect(nextLevel('read', 'read', false)).toBe('none')
  })

  it('쓰기 활성 시 읽기가 자동 부여된다', () => {
    expect(nextLevel('none', 'write', true)).toBe('write')
  })

  it('읽기 해제 시 쓰기도 함께 해제된다', () => {
    expect(nextLevel('write', 'read', false)).toBe('none')
  })

  it('쓰기 해제 시 읽기는 유지된다', () => {
    expect(nextLevel('write', 'write', false)).toBe('read')
  })
})

describe('WORKSPACE_KEYS (P0-2 정합화 회귀)', () => {
  it('office/startup이 권한 콘솔에 노출된다', () => {
    const keys = WORKSPACE_KEYS.map((w) => w.key)
    expect(keys).toContain('office')
    expect(keys).toContain('startup')
  })

  it('폐기된 hub 키가 남아 있지 않다', () => {
    expect(WORKSPACE_KEYS.map((w) => w.key)).not.toContain('hub')
  })
})
