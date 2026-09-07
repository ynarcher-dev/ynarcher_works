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
const mna = itemOf('mna')

describe('DATABASE — 전사 원장 둘 + 하단 고정 창구', () => {
  it('둘 다 읽으면 한 그룹 두 줄이고 그 사이에 선이 없다', () => {
    const groups = buildNavGroups(userWith({ startup: 'read', networks: 'read' }), database)
    // GUEST계정 발급은 목록이 아니라 그 아래 고정 영역이라 그룹이 갈린다.
    expect(shape(groups)).toEqual([
      ['startup:스타트업', 'networks:네트워크'],
      ['startup:GUEST계정 발급'],
    ])
    // 같은 층의 전사 원장이라 선을 그으면 서로 다른 층으로 보인다.
    const rows = groups[0]!.items
    expect(rows.map((b) => Boolean(b.item.dividerBefore))).toEqual([false, false])
  })

  it('한 구획만 읽으면 그 줄만 선다 — 자리를 합쳐도 권한은 구획마다 판정한다', () => {
    const user = userWith({ networks: 'read' })
    expect(shape(buildNavGroups(user, database))).toEqual([['networks:네트워크']])
    expect(readableSections(user, database)).toHaveLength(1)
  })

  it('둘 다 못 읽으면 스위처에서 항목 자체가 빠진다', () => {
    expect(visibleWorkspaces(userWith({ ac: 'write' })).map((w) => w.id)).not.toContain('database')
  })

  it('GUEST계정 발급은 스타트업 구획의 하단 고정 줄이다', () => {
    const groups = buildNavGroups(userWith({ startup: 'read' }), database)
    expect(shape(pinnedOf(groups))).toEqual([['startup:GUEST계정 발급']])
    // 그 탭이 탭 집합에서 빠지면 그 화면에서 원장 줄들이 활성으로 칠해진다.
    expect(allTabs(plainGroups(groups)).has('guest-accounts')).toBe(true)
  })

  it('네트워크만 읽는 사람에게는 창구 줄이 서지 않는다 — 구획이 startup이기 때문이다', () => {
    const groups = buildNavGroups(userWith({ networks: 'read' }), database)
    expect(pinnedOf(groups)).toHaveLength(0)
  })

  it('도착지는 읽을 수 있는 첫 구획이다 — 권한 없는 경로로 떨어지지 않는다', () => {
    expect(landingPath(userWith({ networks: 'read' }), database)).toBe('/networks')
    expect(landingPath(userWith({ startup: 'read', networks: 'read' }), database)).toBe('/startup')
  })
})

describe('M&A/PE — 딜 한 줄 + 거래상대 원장 두 줄', () => {
  it('세 구획이 같은 mna 키를 쓰지만 줄·경로는 갈리고 딜 아래에만 선이 선다', () => {
    const user = userWith({ mna: 'read' })
    const groups = buildNavGroups(user, mna)
    expect(shape(groups)).toEqual([['mna:프로젝트', 'mna:M&A BUYER', 'mna:M&A SELLER']])
    // 층이 갈리는 자리는 딜과 원장 사이 하나다 — 두 원장 사이에 선을 하나 더 그으면
    // 사는 쪽과 파는 쪽이 서로 다른 층으로 보인다.
    const rows = groups.flatMap((g) => g.items)
    expect(rows.map((b) => Boolean(b.item.dividerBefore))).toEqual([false, true, false])
  })

  it('구획의 신원은 키가 아니라 경로다 — 셋이 각자 자기 경로로 잡힌다', () => {
    const user = userWith({ mna: 'read' })
    const visible = visibleWorkspaces(user)
    expect(resolveWorkspace('/mna/programs/abc', visible, user).section?.path).toBe('/mna')
    expect(resolveWorkspace('/buyers/abc', visible, user).section?.path).toBe('/buyers')
    expect(resolveWorkspace('/sellers/abc', visible, user).section?.path).toBe('/sellers')
    for (const p of ['/mna', '/buyers', '/sellers']) {
      expect(resolveWorkspace(p, visible, user).ws?.id).toBe('mna')
    }
  })

  it('도착지는 딜 목록이다 — 원장이 아니라 그 워크스페이스가 하는 일이 먼저 선다', () => {
    expect(landingPath(userWith({ mna: 'read' }), mna)).toBe('/mna')
  })

  it('mna를 읽지 못하면 세 줄이 함께 빠진다', () => {
    expect(visibleWorkspaces(userWith({ fund: 'read' })).map((w) => w.id)).not.toContain('mna')
  })
})

describe('AC — 사업 목록 한 줄', () => {
  it('GUEST계정 발급은 DATABASE로 옮겨 갔다 — AC에는 사업 목록만 남는다', () => {
    const groups = buildNavGroups(userWith({ ac: 'write' }), ac)
    expect(shape(groups)).toEqual([['ac:프로젝트']])
    expect(pinnedOf(groups)).toHaveLength(0)
  })

  it('AC를 읽지 못하면 스위처에서 항목 자체가 빠진다', () => {
    expect(visibleWorkspaces(userWith({ fund: 'read' })).map((w) => w.id)).not.toContain('ac')
  })
})

describe('실행 라인 셋 — 사업 2종이 같은 줄 이름을 공유한다', () => {
  it('어느 원장인지는 스위처 항목이 답하므로 줄 이름은 한 벌이다', () => {
    const user = userWith({ ac: 'write', mna: 'read' })
    for (const id of ['ac', 'mna']) {
      // M&A/PE에는 딜 아래로 거래상대 원장 두 줄이 더 서므로 첫 줄만 견준다 — 견주는 것은
      // 그 워크스페이스가 하는 일의 이름이고, 그 자리는 어디서나 맨 위 한 줄이다.
      const rows = buildNavGroups(user, itemOf(id)).flatMap((g) =>
        g.items.filter((b) => !b.item.pinBottom).map((b) => b.item.label),
      )
      expect(rows[0]).toBe('프로젝트')
    }
  })

  it('셋이 각자 자기 항목으로 서고 도착지는 자기 루트 경로다', () => {
    const user = userWith({ ac: 'write', mna: 'read', fund: 'read' })
    // DATABASE는 서지 않는다 — 그 항목이 덮는 구획은 startup·networks 둘뿐이고, 딜 권한은
    // 이제 M&A/PE 한 자리만 연다(2026-09-07 M&A BUYER 이관).
    expect(visibleWorkspaces(user).map((w) => w.id)).toEqual(['ac', 'mna', 'fund'])
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
