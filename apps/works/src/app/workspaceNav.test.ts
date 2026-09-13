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
import { sidebarIconByTab } from '@/app/sidebarIcons'
import { allTabs } from '@/config/navigation'
import { WORKSPACES, type WorkspaceNavItem } from '@/config/workspaces'
import { ADMIN_TAG_CONFIGS, TAG_CONFIG_GROUPS } from '@/features/admin/tagConfig'

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
  it('GUEST를 독립 항목으로 두지 않은 여덟 워크스페이스가 선다', () => {
    expect(WORKSPACES.map((w) => w.label)).toEqual([
      '내 오피스',
      '공용 오피스',
      '데이터베이스',
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
    expect(shape(unpinnedOf(buildNavGroups(user, myOffice)))).toEqual([
      [
        'office:대시보드',
        'office:전자결재',
        'office:그룹KPI 관리',
        'office:개인KPI 관리',
        'office:주간 회의록',
      ],
    ])
    const commonTabs = allTabs(plainGroups(buildNavGroups(user, commonOffice)))
    expect(commonTabs.has('dashboard')).toBe(false)
    expect(commonTabs.has('approval')).toBe(false)
  })

  it('준비 중 메뉴는 모두 하위 메뉴 없이 독립된 한 줄로 선다', () => {
    const user = userWith({ office: 'read', fund: 'read' })
    const labels = (id: string) =>
      unpinnedOf(buildNavGroups(user, itemOf(id))).flatMap((g) =>
        g.items.filter((b) => b.item.comingSoon).map((b) => b.item.label),
      )

    expect(labels('my-office')).toEqual(['그룹KPI 관리', '개인KPI 관리', '주간 회의록'])
    expect(labels('office')).toEqual([])
    expect(labels('fund')).toEqual(['예비투자심사', '본투자심사', '반기/온기보고'])

    for (const id of ['my-office', 'office', 'fund']) {
      const pendingItems = unpinnedOf(buildNavGroups(user, itemOf(id)))
        .flatMap((g) => g.items)
        .filter((b) => b.item.comingSoon)
      expect(pendingItems.every((b) => !b.item.children && !b.item.tab && !b.item.path)).toBe(true)
    }
  })

  it('내 오피스 메뉴와 구분선을 지정한 순서로 세운다', () => {
    const groups = unpinnedOf(
      buildNavGroups(userWith({ office: 'read' }), itemOf('my-office')),
    )
    expect(shape(groups)).toEqual([
      [
        'office:대시보드',
        'office:전자결재',
        'office:그룹KPI 관리',
        'office:개인KPI 관리',
        'office:주간 회의록',
      ],
    ])
    expect(groups[0]?.group).toBe('개인업무')
    expect(groups[0]?.items.map((b) => b.item.dividerBefore)).toEqual([
      undefined,
      '결재',
      '성과관리',
      undefined,
      '부서업무',
    ])
  })

  it('공용 오피스 메뉴와 구분선을 지정한 순서로 세운다', () => {
    const groups = unpinnedOf(
      buildNavGroups(userWith({ office: 'read' }), itemOf('office')),
    )
    expect(shape(groups)).toEqual([
      [
        'office:전사 일정',
        'office:임직원 정보',
        'office:지사 정보',
        'office:자산 현황',
        'office:회의실 예약',
        'office:회의록 작성',
      ],
      ['office:게시판', 'office:자료실'],
    ])
    expect(groups[0]?.items.map((b) => b.item.dividerBefore)).toEqual([
      undefined,
      '회사정보',
      undefined,
      undefined,
      '회의',
      undefined,
    ])
    expect(groups[0]?.group).toBe('일정')
    expect(groups[1]?.group).toBe('게시')
  })

  it('투자실 메뉴와 구분선을 지정한 순서로 세운다', () => {
    const groups = unpinnedOf(buildNavGroups(userWith({ fund: 'read' }), itemOf('fund')))
    expect(shape(groups)).toEqual([
      [
        'fund:운용펀드',
        'fund:예비투자심사',
        'fund:본투자심사',
        'fund:반기/온기보고',
      ],
    ])
    expect(groups[0]?.items.map((b) => b.item.dividerBefore)).toEqual([
      undefined,
      '투자심사',
      undefined,
      '보고',
    ])
    expect(groups[0]?.group).toBe('펀드 관리')
  })

  it('메뉴가 하나뿐인 워크스페이스도 첫 항목 위에 그룹명을 세운다', () => {
    const user = userWith({ startup: 'read', networks: 'read', project: 'read', mna: 'read' })

    expect(unpinnedOf(buildNavGroups(user, itemOf('database')))[0]?.group).toBe('데이터 원장')
    expect(unpinnedOf(buildNavGroups(user, itemOf('project')))[0]?.group).toBe('프로젝트 관리')
    expect(unpinnedOf(buildNavGroups(user, itemOf('mna')))[0]?.group).toBe('딜 관리')
  })

  it('경영실은 기능 열 개를 노출하고 경영요소 경계에 이름을 붙인다', () => {
    const groups = unpinnedOf(
      buildNavGroups(userWith({ management: 'read' }), itemOf('management')),
    )
    const items = groups[0]?.items ?? []

    expect(items.map((b) => b.item.label)).toEqual([
      '경영 현황',
      'KPI 관리',
      '조직 관리',
      '인사 관리',
      '근태 관리',
      '재무 관리',
      '거래처 정보',
      '결재 금액 집계',
      '지사 관리',
      '자산 관리',
    ])
    expect(items.map((b) => b.item.dividerBefore)).toEqual([
      undefined,
      undefined,
      '조직·인사',
      undefined,
      undefined,
      '재무',
      undefined,
      undefined,
      '총무·인프라',
      undefined,
    ])
    expect(allTabs(plainGroups(groups))).toEqual(
      new Set([
        'dashboard',
        'kpi',
        'departments',
        'hr',
        'attendance',
        'finance',
        'partners',
        'approval-stats',
        'branches',
        'assets',
      ]),
    )
  })

  it('시스템 관리는 권한부터 감사까지 다섯 운영요소로 세운다', () => {
    const groups = unpinnedOf(
      buildNavGroups(userWith({ admin: 'write' }), itemOf('admin')),
    )
    const items = groups[0]?.items ?? []

    expect(groups[0]?.group).toBe('권한·보안')
    expect(items.map((b) => b.item.label)).toEqual([
      '권한 제어 콘솔',
      '민감정보 관리',
      '게시판 관리',
      '회의실 관리',
      '결재 양식 관리',
      '모듈 관리',
      '태그 관리',
      '중복 병합 검증',
      '생성자 교체',
      '감사 로그 모니터',
      '다운로드 사유 로그',
    ])
    expect(items.map((b) => b.item.dividerBefore)).toEqual([
      undefined,
      undefined,
      '운영 설정',
      undefined,
      undefined,
      undefined,
      '기준정보',
      '데이터 관리',
      undefined,
      '감사·로그',
      undefined,
    ])
    const tagItem = items.find((b) => b.item.tab === 'tags')?.item
    expect(tagItem?.children).toBeUndefined()
    expect(items.every((b) => Boolean(b.item.tab && sidebarIconByTab[b.item.tab]))).toBe(true)
  })

  it('태그 관리는 한 줄로 진입하고 2차 메뉴의 모든 종류에 그룹과 아이콘이 있다', () => {
    expect(new Set(ADMIN_TAG_CONFIGS.map((config) => config.group))).toEqual(
      new Set(TAG_CONFIG_GROUPS),
    )
    expect(ADMIN_TAG_CONFIGS.every((config) => Boolean(sidebarIconByTab[config.tab]))).toBe(true)
  })
})

describe('DATABASE — 전사 원장 둘', () => {
  it('둘 다 읽으면 한 그룹 두 줄이고 그 사이에 선이 없다', () => {
    const groups = buildNavGroups(userWith({ startup: 'read', networks: 'read' }), database)
    expect(shape(unpinnedOf(groups))).toEqual([['startup:스타트업', 'networks:네트워크']])
    // 같은 층의 전사 원장이라 선을 그으면 서로 다른 층으로 보인다.
    const rows = groups[0]!.items
    expect(rows.map((b) => b.item.dividerBefore)).toEqual([undefined, undefined])
  })

  it('한 구획만 읽으면 그 줄만 선다 — 자리를 합쳐도 권한은 구획마다 판정한다', () => {
    const user = userWith({ networks: 'read' })
    expect(shape(unpinnedOf(buildNavGroups(user, database)))).toEqual([
      ['networks:네트워크'],
    ])
    expect(readableSections(user, database)).toHaveLength(1)
  })

  it('둘 다 못 읽으면 스위처에서 항목 자체가 빠진다', () => {
    expect(visibleWorkspaces(userWith({ project: 'write' })).map((w) => w.id)).not.toContain('database')
  })

  it('데이터베이스에는 GUEST 계정 창구가 서지 않는다', () => {
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
      ['mna:M&A 프로젝트', 'mna:매수자 명단', 'mna:매도자 명단'],
    ])
    // 층이 갈리는 자리는 딜과 원장 사이 하나다 — 두 원장 사이에 선을 하나 더 그으면
    // 사는 쪽과 파는 쪽이 서로 다른 층으로 보인다.
    const rows = unpinnedOf(groups).flatMap((g) => g.items)
    expect(rows.map((b) => b.item.dividerBefore)).toEqual([
      undefined,
      '거래상대',
      undefined,
    ])
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

describe('GUEST 계정 — 전사 통합 진입점', () => {
  it('사업부 하단에서 통합 GUEST URL을 연다', () => {
    const groups = buildNavGroups(userWith({ project: 'write' }), project)
    expect(shape(unpinnedOf(groups))).toEqual([['project:프로젝트']])
    expect(shape(pinnedOf(groups))).toEqual([['project:GUEST 계정 관리']])
    expect(pinnedOf(groups)[0]?.group).toBe('외부계정')
    expect(allTabs(plainGroups(groups)).has('guest-accounts')).toBe(false)
    expect(pinnedOf(groups)[0]?.items[0]?.item.path).toBe('/guest-accounts')
  })

  it('GUEST는 스위처에 없고 사업부·M&A팀·투자실 하단에만 선다', () => {
    const user = userWith({ office: 'read', startup: 'read', project: 'read', fund: 'read', mna: 'read' })
    expect(visibleWorkspaces(user).map((w) => w.id)).not.toContain('guest-accounts')
    for (const id of ['project', 'mna', 'fund']) {
      expect(pinnedOf(buildNavGroups(user, itemOf(id)))[0]?.items[0]?.item.path).toBe(
        '/guest-accounts',
      )
    }
    for (const id of ['my-office', 'office', 'database']) {
      expect(pinnedOf(buildNavGroups(user, itemOf(id)))).toHaveLength(0)
    }
  })

  it('M&A에도 같은 하단 계정 창구가 선다', () => {
    const pinned = pinnedOf(buildNavGroups(userWith({ mna: 'read' }), mna))
    expect(shape(pinned)).toEqual([['mna:GUEST 계정 관리']])
  })

  it('AC를 읽지 못하면 스위처에서 항목 자체가 빠진다', () => {
    expect(visibleWorkspaces(userWith({ fund: 'read' })).map((w) => w.id)).not.toContain('project')
  })
})

describe('실행 라인 셋 — 각 조직이 실제로 부르는 목록 이름을 쓴다', () => {
  it('사업부는 프로젝트, M&A팀은 M&A 프로젝트로 부른다', () => {
    const user = userWith({ project: 'write', mna: 'read' })
    const firstRow = (id: string) =>
      buildNavGroups(user, itemOf(id)).flatMap((g) =>
        g.items.filter((b) => !b.item.pinBottom).map((b) => b.item.label),
      )[0]

    expect(firstRow('project')).toBe('프로젝트')
    expect(firstRow('mna')).toBe('M&A 프로젝트')
  })

  it('셋이 각자 자기 항목으로 서고 도착지는 자기 루트 경로다', () => {
    const user = userWith({ project: 'write', mna: 'read', fund: 'read' })
    // DATABASE는 서지 않는다 — 그 항목이 덮는 구획은 startup·networks 둘뿐이고, 딜 권한은
    // 이제 M&A/PE 한 자리만 연다(2026-09-07 M&A BUYER 이관).
    expect(visibleWorkspaces(user).map((w) => w.id)).toEqual([
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
