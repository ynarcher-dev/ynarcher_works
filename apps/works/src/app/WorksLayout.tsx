import { ClipboardList, FolderOpen, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import {
  AppShell,
  DropdownItem,
  IconButton,
  Sidebar,
  SidebarItem,
  SidebarDivider,
  WorkspaceSwitcher,
  cn,
} from '@ynarcher/ui'
import { Fragment, useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import logo from '@/assets/logo.png'
import { useAuthStore } from '@/auth/authStore'
import type { WorkspaceSection } from '@/config/workspaces'
import { allTabs, firstTab, pathTabOf, type SubNavItem } from '@/config/navigation'
import {
  buildNavGroups,
  landingPath,
  plainGroups,
  resolveWorkspace,
  visibleWorkspaces,
  type BoundNavItem,
} from '@/app/workspaceNav'
import { SidebarFlyout } from '@/app/SidebarFlyout'
import { TopbarBreadcrumb } from '@/app/TopbarBreadcrumb'
import { GlobalSearchBox } from '@/app/GlobalSearchBox'
import { TopbarActions } from '@/app/TopbarActions'
import { RightPanelProvider } from '@/app/rightPanel'
import { RightPanelHost } from '@/app/RightPanelHost'
import { useBoards } from '@/features/hub/boardHooks'
import { boardsOfKind } from '@/features/hub/boardStore'
import { boardIcon } from '@/features/hub/boardIcons'
import { sidebarGroupIcon, sidebarIconByTab, sidebarIconByWorkspace } from '@/app/sidebarIcons'

/**
 * 인증된 WORKS 셸: 컨텍스트 사이드바(워크스페이스 전환 + 메뉴) + 상단바(전역 기능·계정 메뉴).
 * 근거: 2_app_layout_navigation.md (§2 상단바 / §3 사이드바)
 */
export function WorksLayout() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // 우측 슬라이드오버 폭 계산용 사이드바 폭(펼침 15rem/접힘 4rem). 패널은 body로 포털되므로
  // 문서 루트에 CSS 변수로 실어 전달한다 — 접힘 상태에서도 "1" 트랙과 어긋나지 않게 한다.
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--app-sidebar-w',
      sidebarCollapsed ? '4rem' : '15rem',
    )
  }, [sidebarCollapsed])
  // 사이드바에서 뻗는 플라이아웃은 한 번에 하나만 열린다(열린 항목의 label, 없으면 null).
  const [openFlyout, setOpenFlyout] = useState<string | null>(null)
  const boards = useBoards().data ?? []

  const visible = visibleWorkspaces(user)

  // 현재 스위처 항목 + 그 안의 권한 구획(경로 기준). 미매칭 시 첫 노출 항목으로 폴백.
  // 구획까지 함께 잡는 이유는 경로·글리프·활성 판정이 항목이 아니라 구획 단위이기 때문이다
  // (DATABASE 한 항목이 스타트업·네트워크 두 구획을 덮는다).
  const { ws: currentWs, section: currentSection } = resolveWorkspace(
    location.pathname,
    visible,
    user,
  )

  // 현재 항목의 세부 메뉴(줄마다 자기 구획이 묶여 있다) + 활성 섹션(?tab, 없으면 기본 첫 항목).
  const boundGroups = currentWs ? buildNavGroups(user, currentWs) : []
  // 탭 판정(`allTabs`·`firstTab`)에는 고정 그룹도 함께 넣는다 — 그 줄의 탭이 목록에서 빠지면
  // 그 화면에 서 있는 동안 사이드바의 원장 줄들이 전부 활성으로 칠해진다(`tabOwned`가 거짓이 된다).
  const groups = plainGroups(boundGroups)
  // 사이드바 본문에 서는 그룹과, 그 아래 고정 영역에 서는 그룹.
  const bodyGroups = boundGroups.filter((g) => !g.pinned)
  const pinnedGroup = boundGroups.find((g) => g.pinned)
  // 상세 라우트(/networks/{entity}/:id)는 ?tab이 없으므로 경로 세그먼트에서 활성 탭을 유추한다.
  // (엔티티 키 == 사이드바 탭 키) 이렇게 하지 않으면 firstTab 폴백으로 대시보드가 활성화된다.
  const pathTab = currentSection
    ? pathTabOf(location.pathname, currentSection.path, groups)
    : undefined
  const activeTab =
    new URLSearchParams(location.search).get('tab') ?? pathTab ?? firstTab(groups)

  // 지금 활성인 탭이 이 사이드바의 항목 중 하나인가. 탭 없는 항목(= 워크스페이스 루트)이
  // 언제 활성인지를 이 값이 정한다 — 형제가 활성이면 루트는 물러나고, 아무도 갖지 않은
  // 탭이면(옛 주소 ?tab=mine 등) 루트가 활성으로 남는다.
  const tabOwned = activeTab ? allTabs(groups).has(activeTab) : false

  // 상단바 현재 위치 표시용 섹션명. 사이드바 트리에서 활성 탭의 라벨을 찾고,
  // 레지스트리에서 주입되는 게시판·자료실 상세 탭은 그 상위 1차 메뉴명으로 보완한다.
  // 구획을 둘 이상 덮는 항목에서는 워크스페이스명이 어느 원장인지 답하지 못하므로
  // (DATABASE만으로는 스타트업인지 네트워크인지 모른다) 탭 없는 줄도 섹션명으로 세운다.
  // 구획 하나짜리 항목에서는 종전대로 워크스페이스명만 남긴다 — 목록이 하나뿐이라 그 이름이
  // 이미 어디인지를 답한다.
  const multiSection = (currentWs?.sections.length ?? 0) > 1
  const activeSectionLabel = (() => {
    for (const g of boundGroups) {
      for (const { item, section } of g.items) {
        if (item.tab === activeTab) return item.label
        if (!item.tab && multiSection && section.key === currentSection?.key && !tabOwned) {
          return item.label
        }
        if (item.dynamicKey) {
          const kind = item.dynamicKey === 'archives' ? 'ARCHIVE' : 'POST'
          if (item.dynamicKey === 'boards' && activeTab === 'notices') return item.label
          if (boardsOfKind(boards, kind).some((b) => b.slug === activeTab)) return item.label
        }
        const child = item.children?.find((c) => c.tab === activeTab)
        if (child) return child.label
      }
    }
    return boards.find((b) => b.slug === activeTab)?.label
  })()

  const switcherOptions = visible.map((w) => ({
    key: w.id,
    label: w.implemented ? w.label : `${w.label} (준비 중)`,
    disabled: !w.implemented,
    // 워크스페이스 부제 + 구획 구분선(실행 라인 넷 위, 경영·시스템 둘 위 — 섹션 라벨은 없다).
    description: w.description,
    groupLabel: w.groupLabel,
    divider: w.divider,
  }))

  const goToSection = (item: { tab?: string }, section: WorkspaceSection) => {
    navigate(item.tab ? `${section.path}?tab=${item.tab}` : section.path)
  }

  // 탭 없는 줄(= 그 구획의 루트)은 워크스페이스 글리프를 쓴다. 글리프를 정하는 것도 항목이
  // 아니라 구획이라, 한 항목에 두 줄이 서도 아이콘이 갈린다(스타트업 Rocket / 네트워크 Network).
  const getSidebarIcon = (item: { tab?: string }, section: WorkspaceSection) =>
    item.tab ? sidebarIconByTab[item.tab] : sidebarIconByWorkspace[section.key]

  /**
   * 아이콘 자리에 놓을 요소. 사이드바 글리프는 lucide 선 아이콘 한 종류뿐이다 —
   * 2026-08-20에 '내 ~' 항목의 ⭐ 이모지를 걷었다. 색 있는 글리프는 그 줄을 다른 층의
   * 메뉴로 보이게 하는데, '내 ~'와 '전체 ~'는 같은 원장을 범위만 달리해 보는 한 쌍이다.
   */
  const leafIcon = (item: SubNavItem, section: WorkspaceSection) => {
    const Icon = item.iconKey ? boardIcon(item.iconKey) : getSidebarIcon(item, section)
    return Icon ? <Icon aria-hidden className="size-4" /> : undefined
  }

  /** 사이드바 본체의 메뉴 한 줄(어두운 배경 규격). 플라이아웃 내부는 renderFlyoutLeaf를 쓴다. */
  const renderLeaf = ({ item, section }: BoundNavItem) => {
    return (
      <SidebarItem
        key={item.label}
        icon={leafIcon(item, section)}
        label={item.label}
        // 탭 없는 줄은 자기 구획에 서 있을 때만 활성이다 — 이 조건이 없으면 구획을 둘 덮는
        // 항목에서 두 줄이 동시에 칠해진다(둘 다 탭이 없어 !tabOwned가 함께 참이다).
        active={
          item.tab ? item.tab === activeTab : !tabOwned && section.key === currentSection?.key
        }
        collapsed={sidebarCollapsed}
        onClick={() => goToSection(item, section)}
      />
    )
  }

  /** 플라이아웃 열기/닫기. 사이드바에서 뻗는 패널은 항상 하나만 열리게 한다. */
  const toggleFlyout = (label: string, next: boolean) => {
    setOpenFlyout(next ? label : null)
  }

  /** 플라이아웃(흰 팝오버) 안의 메뉴 한 줄. 사이드바 항목이 아니라 드롭다운 항목 규격을 쓴다. */
  const renderFlyoutLeaf = (item: SubNavItem, section: WorkspaceSection) => {
    const Icon = item.iconKey ? boardIcon(item.iconKey) : getSidebarIcon(item, section)
    const isActive = item.tab ? item.tab === activeTab : false
    return (
      <DropdownItem key={item.label} onClick={() => goToSection(item, section)}>
        <span className="flex items-center gap-2 whitespace-nowrap">
          {Icon && (
            <Icon
              aria-hidden
              className={cn('size-4 shrink-0', isActive ? 'text-brand' : 'text-gray-400')}
            />
          )}
          <span className={isActive ? 'font-semibold text-brand' : undefined}>{item.label}</span>
        </span>
      </DropdownItem>
    )
  }

  const renderItem = ({ item, section }: BoundNavItem) => {
    // 게시판/자료실: 1차 사이드바에는 상위 메뉴만 둔다. 등록된 실제 목록은 전자결재 문서함처럼
    // 화면 안쪽 2차 사이드바가 맡아, 항목이 늘어나도 이 사이드바의 길이는 변하지 않는다.
    if (item.dynamicKey === 'boards' || item.dynamicKey === 'archives') {
      const archive = item.dynamicKey === 'archives'
      const list = boardsOfKind(boards, archive ? 'ARCHIVE' : 'POST')
      const GroupIcon = archive ? FolderOpen : ClipboardList
      return (
        <SidebarItem
          key={item.label}
          icon={<GroupIcon aria-hidden className="size-4" />}
          label={item.label}
          active={
            item.tab === activeTab ||
            (item.dynamicKey === 'boards' && activeTab === 'notices') ||
            list.some((b) => b.slug === activeTab)
          }
          collapsed={sidebarCollapsed}
          onClick={() => goToSection(item, section)}
        />
      )
    }

    const children = item.children
    if (!children) return renderLeaf({ item, section })

    // 하위 항목을 가진 메뉴는 접힘/펼침과 무관하게 우측 플라이아웃으로 연다
    // (게시판·자료실과 같은 조작감). 아래로 펼치면 항목이 늘어날수록 사이드바가 길어진다.
    const anyChildActive = children.some((c) => c.tab === activeTab)
    const GroupIcon =
      (item.groupIconKey ? sidebarGroupIcon[item.groupIconKey] : undefined) ?? ClipboardList
    return (
      <SidebarFlyout
        key={item.label}
        icon={<GroupIcon aria-hidden className="size-4" />}
        label={item.label}
        active={anyChildActive}
        collapsed={sidebarCollapsed}
        open={openFlyout === item.label}
        onOpenChange={(next) => toggleFlyout(item.label, next)}
      >
        {children.map((c) => renderFlyoutLeaf(c, section))}
      </SidebarFlyout>
    )
  }

  /**
   * 사이드바 접기/펴기 토글. 사이드바 헤더가 아니라 상단바 좌측 끝에 두어, 사이드바가 접혀도
   * 버튼 위치가 움직이지 않는다(접힘 폭 안에서 로고 자리로 밀려나던 문제 해소).
   * 모바일에서는 사이드바가 드로어라 상단바 햄버거가 그 역할을 하므로 데스크톱에서만 노출한다.
   */
  const sidebarToggle = (
    // 상단바 우측 액션들과 같은 아이콘 버튼 규격(page 36px)을 쓴다 — 양 끝 버튼의 크기·호버
    // 영역이 다르면 같은 줄에서 아이콘 크기가 달라 보인다.
    <IconButton
      variant="ghost"
      className="hidden lg:grid"
      label={sidebarCollapsed ? '사이드바 열기' : '사이드바 접기'}
      title={sidebarCollapsed ? '사이드바 열기' : '사이드바 접기'}
      onClick={() => {
        // 접기/펴기로 트리거 좌표가 바뀌므로 열려 있던 플라이아웃은 닫는다.
        setOpenFlyout(null)
        setSidebarCollapsed(!sidebarCollapsed)
      }}
      icon={
        sidebarCollapsed ? (
          <PanelLeftOpen aria-hidden className="size-5" strokeWidth={1.8} />
        ) : (
          <PanelLeftClose aria-hidden className="size-5" strokeWidth={1.8} />
        )
      }
    />
  )

  const sidebar = (
    <Sidebar
      collapsed={sidebarCollapsed}
      header={
        // 접기 토글은 상단바로 옮겼고, 헤더에는 로고만 남긴다. 접힘 폭(64px)에는 가로형 로고가
        // 들어가지 않아 감추되, 높이(h-16)는 유지해 상단바와 사이드바의 첫 줄을 맞춘다.
        // 로고는 사이드바 폭 기준 가운데 정렬한다(왼쪽 정렬 시 아래 워크스페이스 스위처·메뉴와
        // 시작선이 어긋나 보이는데, 가로형 로고라 어느 선에 맞춰도 어색했다).
        <div className="flex w-full items-center justify-center">
          {!sidebarCollapsed && (
            <Link to="/office" className="min-w-0 shrink">
              <img src={logo} alt="Y&ARCHER" className="h-7 object-contain" />
            </Link>
          )}
        </div>
      }
      subheader={
        currentWs && (
          // 워크스페이스 전환 메뉴는 자체 상태를 갖는 컴포넌트라, 트리거 클릭을 캡처해
          // 사이드바 플라이아웃을 먼저 닫아준다(팝오버는 항상 하나만 열린다).
          <div onClickCapture={() => setOpenFlyout(null)}>
          <WorkspaceSwitcher
            variant="sidebar"
            collapsed={sidebarCollapsed}
            options={switcherOptions}
            current={currentWs.id}
            onSelect={(id) => {
              const w = visible.find((x) => x.id === id)
              // 도착지는 읽을 수 있는 첫 구획이다 — 구획을 둘 덮는 항목에서 한쪽만 열린
              // 사용자가 권한 없는 경로로 떨어지지 않게 한다.
              const to = w?.implemented ? landingPath(user, w) : undefined
              if (to) navigate(to)
            }}
          />
          </div>
        )
      }
      // 고정 영역은 스크롤 목록 밖이라 자기 경계선을 갖는다(Sidebar가 그린다) — 여기 서는 줄에는
      // `dividerBefore`를 쓰지 않는다.
      footer={
        pinnedGroup && (
          <div className="flex flex-col gap-1">
            {pinnedGroup.items.map((bound) => (
              <Fragment key={bound.item.label}>{renderItem(bound)}</Fragment>
            ))}
          </div>
        )
      }
    >
      {/* 그룹 경계·항목 구분선을 하나의 gap-1 리스트에 평탄화해 SidebarDivider가 어디서든 동일 여백을 내도록 한다. */}
      <div className="flex flex-col gap-1">
        {bodyGroups.map((g, gi) => (
          <Fragment key={g.group ?? gi}>
            {gi > 0 && <SidebarDivider collapsed={sidebarCollapsed} />}
            {g.items.map((bound) => (
              <Fragment key={bound.item.label}>
                {bound.item.dividerBefore && <SidebarDivider collapsed={sidebarCollapsed} />}
                {renderItem(bound)}
              </Fragment>
            ))}
          </Fragment>
        ))}
      </div>
    </Sidebar>
  )

  return (
    <RightPanelProvider>
    <AppShell
      sidebarCollapsed={sidebarCollapsed}
      sidebar={sidebar}
      // 상단바는 사이드바와 역할이 겹치지 않는 전역 기능만 싣는다
      // (사이드바 접기 · 현재 위치 · 전역 검색 · 알림/바로가기). 워크스페이스 전환·계정 메뉴는 사이드바 소관.
      topbarLeft={
        <>
          {sidebarToggle}
          {currentWs && currentSection && (
            <TopbarBreadcrumb
              workspaceLabel={currentWs.label}
              workspacePath={currentSection.path}
              sectionLabel={activeSectionLabel}
            />
          )}
        </>
      }
      topbarCenter={<GlobalSearchBox />}
      topbarRight={<TopbarActions />}
    >
      <Outlet />
      {/* 전역 우측 슬라이드오버(AI·캘린더·알림). body로 포털되므로 본문 레이아웃에는 영향 없음. */}
      <RightPanelHost />
    </AppShell>
    </RightPanelProvider>
  )
}
