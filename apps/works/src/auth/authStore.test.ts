import { describe, expect, it } from 'vitest'
import { hasWorkspaceRead, useAuthStore } from '@/auth/authStore'
import type { AuthUser } from '@/auth/types'

const baseUser: AuthUser = {
  id: 'u1',
  name: '테스트',
  email: null,
  role: 'ac_business',
  permissions: {
    ac: { level: 'write', scopeType: 'program', scopeId: null },
    networks: { level: 'read', scopeType: 'global', scopeId: null },
  },
}

describe('authStore 초기 상태 (P0-1 회귀)', () => {
  it('부팅 직후에는 loading/null — 기본 인증 사용자가 없어야 한다', () => {
    const s = useAuthStore.getState()
    expect(s.status).toBe('loading')
    expect(s.user).toBeNull()
  })
})

describe('hasWorkspaceRead', () => {
  it('미로그인(null)은 모든 워크스페이스 접근 불가', () => {
    expect(hasWorkspaceRead(null, 'ac')).toBe(false)
    expect(hasWorkspaceRead(null, 'admin')).toBe(false)
  })

  it('super_admin은 권한 행 없이도 전 워크스페이스 통과(RLS is_admin과 일치)', () => {
    const admin: AuthUser = { ...baseUser, role: 'super_admin', permissions: {} }
    expect(hasWorkspaceRead(admin, 'admin')).toBe(true)
    expect(hasWorkspaceRead(admin, 'office')).toBe(true)
    expect(hasWorkspaceRead(admin, 'startup')).toBe(true)
  })

  it('read/write 권한 모두 읽기 접근을 허용한다', () => {
    expect(hasWorkspaceRead(baseUser, 'ac')).toBe(true)
    expect(hasWorkspaceRead(baseUser, 'networks')).toBe(true)
  })

  it('권한 행이 없는 워크스페이스는 차단된다 (office/startup 신키 포함)', () => {
    expect(hasWorkspaceRead(baseUser, 'fund')).toBe(false)
    expect(hasWorkspaceRead(baseUser, 'office')).toBe(false)
    expect(hasWorkspaceRead(baseUser, 'startup')).toBe(false)
  })
})
