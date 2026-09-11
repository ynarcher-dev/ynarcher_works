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

/**
 * 고정 영역을 뺀 그룹만 — 줄 순서와 구분선을 볼 때 쓴다.
 *
 * 공개 헬퍼 `plainGroups`와 다르다: 저쪽은 `section`을 벗겨 낸 평평한 모양을 돌려주므로
 * `shape`가 읽을 수 없다. 여기서는 묶음만 걸러 낸다.
 */
function unpinnedOf(groups: BoundNavGroup[]): BoundNavGroup[] {
  return groups.filter((g) => !g.pinned)
}

const database = itemOf('database')
const project = itemOf('project')
const mna = itemOf('mna')

describe('워크스페이스 메뉴 — 확정 명칭과 순서', () => {
  it('내 오피스부터 시스템 관리까지 합의한 여덟 메뉴가 선다', () => {
    expect(WORKSPACES.map((w) => w.label)).toEqual([
      '내 오피스',
      '공용 오피스',
      '데이터 센터',
      '사업부',
      'M&A팀',
      '투자실',
      '경영실',
      '시스템 관리',
    ])
  })

  it('내 오피스는 기존 office 권한으로 열리고 독립 경로로 진입한다', () => {
    const myOffice = itemOf('my-office')
    const commonOffice = itemOf('office')
    const user = userWith({ office: 'read' })
    expect(visibleWorkspaces(userWith({ office: 'read' })).map((w) => w.id)).toEqual([
      'my-office',
      'office',
    ])
    expect(landingPath(user, myOffice)).toBe('/my-office')
    expect(shape(buildNavGroups(user, myOffice))).toEqual([
      ['office:대시보드', 'office:전자결재'],
    ])
    const commonTabs = allTabs(plainGroups(buildNavGroups(user, commonOffice)))
    expect(commonTabs.has('dashboard')).toBe(false)
    expect(commonTabs.has('approval')).toBe(false)
  })
})

describe('DATABASE — 전사 원장 둘', () => {
  it('둘 다 읽으면 한 그룹 두 줄이고 그 사이에 선이 없다', () => {
    const groups = buildNavGroups(userWith({ startup: 'read', networks: 'read' }), database)
    expect(shape(groups)).toEqual([['startup:스타트업 DB', 'networks:네트워크 DB']])
    // 같은 층의 전사 원장이라 선을 그으면 서로 다른 층으로 보인다.
    const rows = groups[0]!.items
    expect(rows.map((b) => Boolean(b.item.dividerBefore))).toEqual([false, false])
  })

  it('한 구획만 읽으면 그 줄만 선다 — 자리를 합쳐도 권한은 구획마다 판정한다', () => {
    const user = userWith({ networks: 'read' })
    expect(shape(buildNavGroups(user, database))).toEqual([['networks:네트워크 DB']])
    expect(readableSections(user, database)).toHaveLength(1)
  })

  it('둘 다 못 읽으면 스위처에서 항목 자체가 빠진다', () => {
    expect(visibleWorkspaces(userWith({ project: 'write' })).map((w) => w.id)).not.toContain('database')
  })

  it('포털 계정 줄은 여기 없다 — 창구는 사업 워크스페이스가 갖는다', () => {
    const groups = buildNavGroups(userWith({ startup: 'read', networks: 'read' }), database)
    expect(pinnedOf(groups)).toHaveLength(0)
    expect(allTabs(plainGroups(groups)).has('guest-accounts')).toBe(false)
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
    // 계정생성은 하단 고정 영역이라 이 줄들과 그룹이 갈린다(plainGroups가 그것을 뺀다).
    expect(shape(unpinnedOf(groups))).toEqual([
      ['mna:프로젝트', 'mna:BUYER DB', 'mna:SELLER DB'],
    ])
    // 층이 갈리는 자리는 딜과 원장 사이 하나다 — 두 원장 사이에 선을 하나 더 그으면
    // 사는 쪽과 파는 쪽이 서로 다른 층으로 보인다.
    const rows = unpinnedOf(groups).flatMap((g) => g.items)
    expect(rows.map((b) => Boolean(b.item.dividerBefore))).toEqual([false, true, false])
  })

  it('구획의 신원은 키가 아니라 경로다 — 셋이 각자 자기 경로로 잡힌다', () => {
    const user = userWith({ mna: 'read' })
    const visible = visibleWorkspaces(user)
    expect(resolveWorkspace('/mna/deals/abc', visible, user).section?.path).toBe('/mna')
    expect(resolveWorkspace('/mna/buyers/abc', visible, user).section?.path).toBe('/mna/buyers')
    expect(resolveWorkspace('/mna/sellers/abc', visible, user).section?.path).toBe('/mna/sellers')
    for (const p of ['/mna', '/mna/buyers', '/mna/sellers']) {
      expect(resolveWorkspace(p, visible, user).ws?.id).toBe('mna')
    }
  })

  // 2026-09-09 이전에는 `startsWith`라 `/mna/buyers`가 `/mna`에 먼저 걸렸고, 그래서 원장
  // 경로가 소속과 무관하게 최상위(`/buyers`)에 서 있었다. 아래 둘이 그 판정을 못박는다.
  it('겹치는 구획에서는 더 긴 경로가 이긴다 — 목록 순서가 판정을 좌우하지 않는다', () => {
    const user = userWith({ mna: 'read' })
    const visible = visibleWorkspaces(user)
    // `/mna`가 목록에서 먼저지만, 더 구체적인 `/mna/buyers`가 답해야 한다.
    expect(resolveWorkspace('/mna/buyers', visible, user).section?.path).toBe('/mna/buyers')
  })

  it('앞머리가 같은 남남은 걸리지 않는다 — 경계는 세그먼트다', () => {
    // 폴백이 어디인지 분명하도록 OFFICE를 첫 항목으로 함께 연다 — `not.toBe(...)`로만
    // 확인하면 폴백이 그 구획으로 떨어져도 통과해 아무것도 못박지 못한다.
    const user = userWith({ office: 'read', mna: 'read', project: 'read' })
    const visible = visibleWorkspaces(user)
    // `/mnaXYZ`는 `/mna`로 시작하지만 그 아래가 아니다. `/projects`도 `/project`가 아니다.
    expect(resolveWorkspace('/mnaXYZ', visible, user).section?.path).toBe('/my-office')
    expect(resolveWorkspace('/projects', visible, user).section?.path).toBe('/my-office')
    // 반면 자기 자신과 그 아래는 걸린다.
    expect(resolveWorkspace('/mna', visible, user).section?.path).toBe('/mna')
    expect(resolveWorkspace('/project/abc', visible, user).section?.path).toBe('/project')
  })

  it('도착지는 딜 목록이다 — 원장이 아니라 그 워크스페이스가 하는 일이 먼저 선다', () => {
    expect(landingPath(userWith({ mna: 'read' }), mna)).toBe('/mna')
  })

  it('mna를 읽지 못하면 세 줄이 함께 빠진다', () => {
    expect(visibleWorkspaces(userWith({ fund: 'read' })).map((w) => w.id)).not.toContain('mna')
  })
})

describe('AC — 사업 목록 + 하단 고정 창구', () => {
  it('GUEST 계정 조회 줄은 목록이 아니라 그 아래 고정 영역이라 그룹이 갈린다', () => {
    const groups = buildNavGroups(userWith({ project: 'write' }), project)
    expect(shape(groups)).toEqual([
      ['project:프로젝트'],
      ['project:GUEST 계정조회'],
    ])
    // 그 탭이 탭 집합에서 빠지면 그 화면에서 사업 목록 줄이 활성으로 칠해진다.
    expect(allTabs(plainGroups(groups)).has('guest-accounts')).toBe(true)
  })

  it('M&A에도 창구가 선다 — 외부인이 들어오는 자리가 셋으로 넓어졌다(2026-09-08)', () => {
    // 2026-09-07에는 AC에만 있었고 근거는 "게스트가 걸리는 사업이 전부 AC"였다. M&A가
    // 자기 원장(ma_sellers·ma_buyers)에서 계정을 세우게 되면서 그 근거가 사라진다 —
    // 그 인격은 AC 창구에 설 수 없으므로(3_9_2 §6) 창구가 워크스페이스마다 하나여야 한다.
    const pinned = pinnedOf(buildNavGroups(userWith({ mna: 'read' }), mna))
    expect(pinned).toHaveLength(1)
    expect(pinned[0]?.items.map((b) => b.item.tab)).toEqual(['guest-accounts'])
  })

  it('AC를 읽지 못하면 스위처에서 항목 자체가 빠진다', () => {
    expect(visibleWorkspaces(userWith({ fund: 'read' })).map((w) => w.id)).not.toContain('project')
  })
})

describe('실행 라인 셋 — 사업 2종이 같은 줄 이름을 공유한다', () => {
  it('어느 원장인지는 스위처 항목이 답하므로 줄 이름은 한 벌이다', () => {
    const user = userWith({ project: 'write', mna: 'read' })
    for (const id of ['project', 'mna']) {
      // M&A/PE에는 딜 아래로 거래상대 원장 두 줄이 더 서므로 첫 줄만 견준다 — 견주는 것은
      // 그 워크스페이스가 하는 일의 이름이고, 그 자리는 어디서나 맨 위 한 줄이다.
      const rows = buildNavGroups(user, itemOf(id)).flatMap((g) =>
        g.items.filter((b) => !b.item.pinBottom).map((b) => b.item.label),
      )
      expect(rows[0]).toBe('프로젝트')
    }
  })

  it('셋이 각자 자기 항목으로 서고 도착지는 자기 루트 경로다', () => {
    const user = userWith({ project: 'write', mna: 'read', fund: 'read' })
    // DATABASE는 서지 않는다 — 그 항목이 덮는 구획은 startup·networks 둘뿐이고, 딜 권한은
    // 이제 M&A/PE 한 자리만 연다(2026-09-07 M&A BUYER 이관).
    expect(visibleWorkspaces(user).map((w) => w.id)).toEqual(['project', 'mna', 'fund'])
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
    const user = userWith({ project: 'write', fund: 'read' })
    const { ws, section } = resolveWorkspace('/fund', visibleWorkspaces(user), user)
    expect(ws?.id).toBe('fund')
    expect(section?.key).toBe('fund')
  })

  it('구획을 읽지 못하는 경로는 그 항목으로 잡히지 않는다(첫 노출 항목으로 폴백)', () => {
    const user = userWith({ networks: 'read', office: 'read' })
    const { ws, section } = resolveWorkspace('/startup/xyz', visibleWorkspaces(user), user)
    expect(ws?.id).toBe('my-office')
    expect(section?.key).toBe('office')
  })
})
