import { describe, expect, it } from 'vitest'
import type { AuthUser, PermissionLevel, WorkspaceKey } from '@/auth/types'
import {
  buildNavGroups,
  landingPath,
  plainGroups,
  readableSections,
  resolveWorkspace,
  visibleWorkspaces,
  type BoundNavGroup,
} from '@/app/workspaceNav'
import { allTabs } from '@/config/navigation'
import { WORKSPACES, type WorkspaceNavItem } from '@/config/workspaces'

function userWith(perms: Partial<Record<WorkspaceKey, PermissionLevel>>): AuthUser {
  return {
    id: 'u1',
    name: '테스트',
    email: null,
    role: 'ac_business',
    permissions: Object.fromEntries(
      Object.entries(perms).map(([k, level]) => [k, { level, scopeType: 'global', scopeId: null }]),
    ),
  }
}

function itemOf(id: string): WorkspaceNavItem {
  const ws = WORKSPACES.find((w) => w.id === id)
  if (!ws) throw new Error(`스위처 항목 없음: ${id}`)
  return ws
}

/** 그룹을 `[구획키:줄이름]`의 이중 배열로 펴서, 줄 순서와 그룹 경계를 함께 본다. */
function shape(groups: BoundNavGroup[]): string[][] {
  return groups.map((g) => g.items.map((b) => `${b.section.key}:${b.item.label}`))
}

/** 사이드바 하단 고정 영역에 서는 그룹만. */
function pinnedOf(groups: BoundNavGroup[]): BoundNavGroup[] {
  return groups.filter((g) => g.pinned)
}

const database = itemOf('database')
const business = itemOf('business')

describe('DATABASE — 원장 둘이 한 항목 아래 선다', () => {
  it('둘 다 읽으면 구분선 없이 한 그룹 두 줄이다', () => {
    const groups = buildNavGroups(userWith({ startup: 'read', networks: 'read' }), database)
    expect(shape(groups)).toEqual([['startup:스타트업', 'networks:네트워크']])
  })

  it('한 구획만 읽으면 그 줄만 선다 — 자리를 합쳐도 권한은 구획마다 판정한다', () => {
    const user = userWith({ networks: 'read' })
    expect(shape(buildNavGroups(user, database))).toEqual([['networks:네트워크']])
    expect(readableSections(user, database)).toHaveLength(1)
  })

  it('둘 다 못 읽으면 스위처에서 항목 자체가 빠진다', () => {
    expect(visibleWorkspaces(userWith({ ac: 'write' })).map((w) => w.id)).not.toContain('database')
  })

  it('도착지는 읽을 수 있는 첫 구획이다 — 권한 없는 경로로 떨어지지 않는다', () => {
    expect(landingPath(userWith({ networks: 'read' }), database)).toBe('/networks')
    expect(landingPath(userWith({ startup: 'read', networks: 'read' }), database)).toBe('/startup')
  })
})

describe('BUSINESS — 실행 라인 넷이 한 항목 아래 선다', () => {
  it('원장 넷이 한 그룹으로 서고 GUEST계정 발급만 하단 고정 그룹으로 빠진다', () => {
    const user = userWith({ ac: 'write', mna: 'read', project: 'read', fund: 'read' })
    const groups = buildNavGroups(user, business)
    expect(shape(groups)).toEqual([
      ['ac:AC사업', 'project:글로벌 · 신사업', 'mna:M&A팀 · PE', 'fund:투자실'],
      ['ac:GUEST계정 발급'],
    ])
    expect(shape(pinnedOf(groups))).toEqual([['ac:GUEST계정 발급']])
  })

  it('고정 줄의 탭도 탭 집합에 남는다 — 빠지면 그 화면에서 원장 줄이 모두 활성으로 칠해진다', () => {
    const user = userWith({ ac: 'write', fund: 'read' })
    expect(allTabs(plainGroups(buildNavGroups(user, business))).has('guest-accounts')).toBe(true)
  })

  it('사업 3종의 줄 이름이 서로 다르다 — 한 자리에 서면 이름이 유일한 구분이다', () => {
    const user = userWith({ ac: 'write', mna: 'read', project: 'read', fund: 'read' })
    const labels = buildNavGroups(user, business).flatMap((g) => g.items.map((b) => b.item.label))
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('AC를 읽지 못하면 그 원장 줄도 고정 그룹도 함께 빠진다 — 빈 그룹은 서지 않는다', () => {
    const user = userWith({ mna: 'read', fund: 'read' })
    const groups = buildNavGroups(user, business)
    expect(shape(groups)).toEqual([['mna:M&A팀 · PE', 'fund:투자실']])
    expect(pinnedOf(groups)).toHaveLength(0)
  })
})

describe('resolveWorkspace — 항목과 구획을 함께 잡는다', () => {
  it('/networks 상세 경로는 DATABASE 항목의 networks 구획으로 해석된다', () => {
    const user = userWith({ startup: 'read', networks: 'read', office: 'read' })
    const { ws, section } = resolveWorkspace('/networks/abc-123', visibleWorkspaces(user), user)
    expect(ws?.id).toBe('database')
    expect(section?.key).toBe('networks')
  })

  it('/fund는 BUSINESS 항목의 fund 구획으로 해석된다', () => {
    const user = userWith({ ac: 'write', fund: 'read' })
    const { ws, section } = resolveWorkspace('/fund', visibleWorkspaces(user), user)
    expect(ws?.id).toBe('business')
    expect(section?.key).toBe('fund')
  })

  it('구획을 읽지 못하는 경로는 그 항목으로 잡히지 않는다(첫 노출 항목으로 폴백)', () => {
    const user = userWith({ networks: 'read', office: 'read' })
    const { ws, section } = resolveWorkspace('/startup/xyz', visibleWorkspaces(user), user)
    expect(ws?.id).toBe('office')
    expect(section?.key).toBe('office')
  })
})
