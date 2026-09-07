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
const ac = itemOf('ac')

describe('DATABASE — 원장 셋이 한 항목 아래 선다', () => {
  it('셋 다 읽으면 한 그룹 세 줄이고 M&A BUYER 앞에만 선이 선다', () => {
    const groups = buildNavGroups(
      userWith({ startup: 'read', networks: 'read', mna: 'read' }),
      database,
    )
    expect(shape(groups)).toEqual([
      ['startup:스타트업', 'networks:네트워크', 'mna:M&A BUYER'],
    ])
    // 앞 두 줄은 전사 SSOT이고 셋째 줄은 M&A/PE 소유라 층이 다르다 — 그 경계만 선이 답한다.
    const rows = groups.flatMap((g) => g.items)
    expect(rows.map((b) => Boolean(b.item.dividerBefore))).toEqual([false, false, true])
  })

  it('구획마다 권한을 따로 판정한다 — 딜 권한만 있으면 BUYER 줄만 선다', () => {
    const user = userWith({ mna: 'read' })
    expect(shape(buildNavGroups(user, database))).toEqual([['mna:M&A BUYER']])
    expect(readableSections(user, database)).toHaveLength(1)
  })

  it('한 구획만 읽으면 그 줄만 선다 — 자리를 합쳐도 권한은 구획마다 판정한다', () => {
    const user = userWith({ networks: 'read' })
    expect(shape(buildNavGroups(user, database))).toEqual([['networks:네트워크']])
    expect(readableSections(user, database)).toHaveLength(1)
  })

  it('셋 다 못 읽으면 스위처에서 항목 자체가 빠진다', () => {
    expect(visibleWorkspaces(userWith({ ac: 'write' })).map((w) => w.id)).not.toContain('database')
  })

  it('도착지는 읽을 수 있는 첫 구획이다 — 권한 없는 경로로 떨어지지 않는다', () => {
    expect(landingPath(userWith({ networks: 'read' }), database)).toBe('/networks')
    expect(landingPath(userWith({ startup: 'read', networks: 'read' }), database)).toBe('/startup')
    expect(landingPath(userWith({ mna: 'read' }), database)).toBe('/buyers')
  })

  it('같은 mna 키가 두 자리에 서지만 줄과 경로는 갈린다', () => {
    const user = userWith({ mna: 'read' })
    // 자리를 가르는 것은 권한 키가 아니라 경로다.
    expect(resolveWorkspace('/buyers/abc', visibleWorkspaces(user), user).ws?.id).toBe('database')
    expect(resolveWorkspace('/mna', visibleWorkspaces(user), user).ws?.id).toBe('mna')
    expect(shape(buildNavGroups(user, itemOf('mna')))).toEqual([['mna:프로젝트']])
  })
})

describe('AC — 사업 목록 한 줄 + 하단 고정 줄', () => {
  it('사업 목록 줄과 GUEST계정 발급이 다른 그룹으로 갈린다', () => {
    const groups = buildNavGroups(userWith({ ac: 'write' }), ac)
    expect(shape(groups)).toEqual([['ac:프로젝트'], ['ac:GUEST계정 발급']])
    expect(shape(pinnedOf(groups))).toEqual([['ac:GUEST계정 발급']])
  })

  it('고정 줄의 탭도 탭 집합에 남는다 — 빠지면 그 화면에서 사업 목록 줄이 활성으로 칠해진다', () => {
    const groups = buildNavGroups(userWith({ ac: 'write' }), ac)
    expect(allTabs(plainGroups(groups)).has('guest-accounts')).toBe(true)
  })

  it('AC를 읽지 못하면 스위처에서 항목 자체가 빠진다', () => {
    expect(visibleWorkspaces(userWith({ fund: 'read' })).map((w) => w.id)).not.toContain('ac')
  })
})

describe('실행 라인 넷 — 사업 3종이 같은 줄 이름을 공유한다', () => {
  it('어느 원장인지는 스위처 항목이 답하므로 줄 이름은 한 벌이다', () => {
    const user = userWith({ ac: 'write', mna: 'read', project: 'read' })
    for (const id of ['ac', 'mna', 'project']) {
      const rows = buildNavGroups(user, itemOf(id)).flatMap((g) =>
        g.items.filter((b) => !b.item.pinBottom).map((b) => b.item.label),
      )
      expect(rows).toEqual(['프로젝트'])
    }
  })

  it('넷이 각자 자기 항목으로 서고 도착지는 자기 루트 경로다', () => {
    const user = userWith({ ac: 'write', mna: 'read', project: 'read', fund: 'read' })
    // DATABASE가 함께 서는 것은 그 항목이 mna 구획(M&A BUYER)도 덮기 때문이다 — 딜 권한
    // 하나로 두 자리가 열린다(항목이 덮는 것은 자리이고 권한은 구획마다 판정한다).
    expect(visibleWorkspaces(user).map((w) => w.id)).toEqual([
      'database',
      'ac',
      'project',
      'mna',
      'fund',
    ])
    expect(landingPath(user, itemOf('fund'))).toBe('/fund')
  })
})

describe('resolveWorkspace — 항목과 구획을 함께 잡는다', () => {
  it('/networks 상세 경로는 DATABASE 항목의 networks 구획으로 해석된다', () => {
    const user = userWith({ startup: 'read', networks: 'read', office: 'read' })
    const { ws, section } = resolveWorkspace('/networks/abc-123', visibleWorkspaces(user), user)
    expect(ws?.id).toBe('database')
    expect(section?.key).toBe('networks')
  })

  it('/fund는 FUND 항목의 fund 구획으로 해석된다', () => {
    const user = userWith({ ac: 'write', fund: 'read' })
    const { ws, section } = resolveWorkspace('/fund', visibleWorkspaces(user), user)
    expect(ws?.id).toBe('fund')
    expect(section?.key).toBe('fund')
  })

  it('구획을 읽지 못하는 경로는 그 항목으로 잡히지 않는다(첫 노출 항목으로 폴백)', () => {
    const user = userWith({ networks: 'read', office: 'read' })
    const { ws, section } = resolveWorkspace('/startup/xyz', visibleWorkspaces(user), user)
    expect(ws?.id).toBe('office')
    expect(section?.key).toBe('office')
  })
})
