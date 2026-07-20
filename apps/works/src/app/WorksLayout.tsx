import {
  Award,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardList,
  Download,
  Folder,
  Globe,
  Handshake,
  LayoutGrid,
  Lightbulb,
  Link2,
  LockKeyhole,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Rocket,
  Search,
  Sparkles,
  Star,
  Target,
  User,
  Users,
  WalletCards,
  Megaphone,
  FolderOpen,
  LayoutDashboard,
  Factory,
  Tags,
  UserCog,
  Medal,
  Shapes,
  Coins,
  Building2,
  Landmark,
  TrendingUp,
  ShoppingCart,
  PiggyBank,
  GraduationCap,
  Boxes,
  EyeOff,
  Component,
  Upload,
  DoorOpen,
  Network,
  Gauge,
  Building,
  Layers,
  LogOut,
  Sprout,
  FileText,
  ScanLine,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  AppShell,
  Avatar,
  Dropdown,
  DropdownItem,
  Sidebar,
  SidebarItem,
  SidebarDivider,
  WorkspaceSwitcher,
  cn,
} from '@ynarcher/ui'
import { Fragment, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import logo from '@/assets/logo.png'
import { hasWorkspaceRead, useAuthStore } from '@/auth/authStore'
import { employeeAuth } from '@/auth/employeeAuthService'
import { WORKSPACES } from '@/config/workspaces'
import { WORKSPACE_SUBNAV, firstTab, pathTabOf, type SubNavItem } from '@/config/navigation'
import { MenuSectionLabel, SidebarFlyout } from '@/app/SidebarFlyout'
import { boardsOfKind, useBoardStore } from '@/features/hub/boardStore'
import { boardIcon } from '@/features/hub/boardIcons'

const sidebarIconByTab: Record<string, LucideIcon> = {
  // HUB 그룹 1: 메인
  dashboard: LayoutDashboard,
  ai: Sparkles,
  calendar: CalendarDays,
  notices: Megaphone,
  files: FolderOpen,
  insights: Lightbulb,

  // HUB 그룹 2: 마스터 정보
  managers: Users,
  startups: Rocket,
  experts: BriefcaseBusiness,
  partners: Handshake,
  orgs: Handshake,

  // NETWORKS 8종 네트워크
  van: Handshake,
  exp: Star,
  global: Globe,
  investors: Coins,
  corporates: Building2,
  institutions: Landmark,
  universities: GraduationCap,
  etc: Component,
  others: Boxes,

  // HUB 그룹 3: 현황 정보
  ac: Target,
  mine: User,
  all: LayoutGrid,
  mna: BriefcaseBusiness,
  project: Folder,

  // 사업 워크스페이스(AC/M&A/PROJECT) 사업구분 세분화 메뉴.
  // `global`(글로벌)·`etc`(기타)는 NETWORKS 매핑을 그대로 재사용한다.
  public: Landmark,
  private: Building2,
  revenue: Coins,
  sell: TrendingUp,
  buy: ShoppingCart,
  pe_fund: PiggyBank,
  new_biz: Lightbulb,

  // FUND 종류별 메뉴(`pe_fund`는 M&A 사업구분 매핑을 그대로 재사용한다).
  ac_fund: Target,
  vc_fund: Coins,

  // HUB 그룹 4: 실적 정보
  fund: WalletCards,
  management: ChartNoAxesCombined,

  // 기존 탭 매핑 유지
  search: Search,
  ranking: Award,
  directory: Users,
  merge: Link2,
  bulk: Upload,
  kanban: BadgeCheck,
  matching: LayoutGrid,
  permissions: LockKeyhole,
  boards: ClipboardList,
  industries: Factory,
  fields: Tags,
  positions: UserCog,
  ranks: Medal,
  pay_steps: Layers,
  categories: Shapes,
  sensitive: EyeOff,
  audit: ReceiptText,
  downloads: Download,
  approval: BadgeCheck,
  clients: Handshake,
  rooms: DoorOpen,
  hr: User,
  finance: WalletCards,
  assets: BriefcaseBusiness,
  departments: Network,
  branches: Building,
  kpi: Gauge,

  // STARTUP 워크스페이스
  invested: Coins,
  incubated: Sprout,
  discovered: Rocket,
  minutes: FileText,
  archerscan: ScanLine,
}

const sidebarIconByWorkspace: Record<string, LucideIcon> = {
  startup: Rocket,
  ac: Target,
  fund: WalletCards,
  project: Folder,
}

/**
 * 인증된 WORKS 셸: 상단바 워크스페이스 전환 드롭다운 + 컨텍스트 사이드바 + 프로필 메뉴.
 * 근거: 2_app_layout_navigation.md (§2 상단바 / §3 사이드바)
 */
export function WorksLayout() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const location = useLocation()
  const [profileOpen, setProfileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  // 사이드바에서 뻗는 플라이아웃은 한 번에 하나만 열린다(열린 항목의 label, 없으면 null).
  const [openFlyout, setOpenFlyout] = useState<string | null>(null)
  const boards = useBoardStore((s) => s.boards)

  const visible = WORKSPACES.filter((w) => hasWorkspaceRead(user, w.key))

  // 현재 워크스페이스(경로 기준). 미매칭 시 첫 노출 워크스페이스로 폴백.
  const currentWs =
    visible.find((w) => location.pathname.startsWith(w.path)) ?? visible[0]

  // 현재 워크스페이스의 세부 메뉴 + 활성 섹션(?tab, 없으면 기본 첫 항목).
  const groups = currentWs ? WORKSPACE_SUBNAV[currentWs.key] ?? [] : []
  // 상세 라우트(/networks/{entity}/:id)는 ?tab이 없으므로 경로 세그먼트에서 활성 탭을 유추한다.
  // (엔티티 키 == 사이드바 탭 키) 이렇게 하지 않으면 firstTab 폴백으로 대시보드가 활성화된다.
  const pathTab = currentWs ? pathTabOf(location.pathname, currentWs.path, groups) : undefined
  const activeTab =
    new URLSearchParams(location.search).get('tab') ?? pathTab ?? firstTab(groups)

  const switcherOptions = visible.map((w) => ({
    key: w.key,
    label: w.implemented ? w.label : `${w.label} (준비 중)`,
    disabled: !w.implemented,
    // 워크스페이스 부제 + 4개 구획(업무 허브/마스터·네트워크/투자 사업/경영·시스템) 섹션 헤더.
    description: w.description,
    groupLabel: w.groupLabel,
    divider: w.divider,
  }))

  const goToSection = (item: { tab?: string }) => {
    if (!currentWs) return
    navigate(item.tab ? `${currentWs.path}?tab=${item.tab}` : currentWs.path)
  }

  const getSidebarIcon = (item: { tab?: string }) =>
    item.tab
      ? sidebarIconByTab[item.tab]
      : currentWs
        ? sidebarIconByWorkspace[currentWs.key]
        : undefined

  /** 사이드바 본체의 메뉴 한 줄(어두운 배경 규격). 플라이아웃 내부는 renderFlyoutLeaf를 쓴다. */
  const renderLeaf = (item: SubNavItem) => {
    const Icon = item.iconKey ? boardIcon(item.iconKey) : getSidebarIcon(item)
    return (
      <SidebarItem
        key={item.label}
        icon={Icon ? <Icon aria-hidden className="size-4" /> : undefined}
        label={item.label}
        active={item.tab ? item.tab === activeTab : true}
        collapsed={sidebarCollapsed}
        onClick={() => goToSection(item)}
      />
    )
  }

  /** 플라이아웃 열기/닫기. 다른 팝오버(계정 메뉴 포함)는 함께 닫아 항상 하나만 열리게 한다. */
  const toggleFlyout = (label: string, next: boolean) => {
    setOpenFlyout(next ? label : null)
    if (next) setProfileOpen(false)
  }

  /** 플라이아웃(흰 팝오버) 안의 메뉴 한 줄. 사이드바 항목이 아니라 드롭다운 항목 규격을 쓴다. */
  const renderFlyoutLeaf = (item: SubNavItem) => {
    const Icon = item.iconKey ? boardIcon(item.iconKey) : getSidebarIcon(item)
    const isActive = item.tab ? item.tab === activeTab : false
    return (
      <DropdownItem key={item.label} onClick={() => goToSection(item)}>
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

  const renderItem = (item: SubNavItem) => {
    // 게시판/자료실: 상위 단일 항목으로 두고, 클릭하면 우측 플라이아웃에 등록된 목록을 펼친다
    // (워크스페이스 전환과 같은 조작감). 게시판이 늘어나도 사이드바 길이가 변하지 않는다.
    if (item.dynamicKey === 'boards' || item.dynamicKey === 'archives') {
      const archive = item.dynamicKey === 'archives'
      const list = boardsOfKind(boards, archive ? 'ARCHIVE' : 'POST')
      const GroupIcon = archive ? FolderOpen : ClipboardList
      return (
        <SidebarFlyout
          key={item.label}
          icon={<GroupIcon aria-hidden className="size-4" />}
          label={item.label}
          active={list.some((b) => b.slug === activeTab)}
          collapsed={sidebarCollapsed}
          open={openFlyout === item.label}
          onOpenChange={(next) => toggleFlyout(item.label, next)}
        >
          {list.length > 0 ? (
            list.map((b) => renderFlyoutLeaf({ label: b.label, tab: b.slug, iconKey: b.icon }))
          ) : (
            <p className="px-3 py-1.5 text-body text-gray-400">
              등록된 {item.label}이 없습니다.
            </p>
          )}
        </SidebarFlyout>
      )
    }

    const children = item.children
    if (!children) return renderLeaf(item)

    const anyChildActive = children.some((c) => c.tab === activeTab)

    // 접힘 상태: 아이콘 호버 시 우측 플라이아웃으로 하위 메뉴 노출.
    if (sidebarCollapsed) {
      return (
        <SidebarFlyout
          key={item.label}
          icon={<ClipboardList aria-hidden className="size-4" />}
          label={item.label}
          active={anyChildActive}
          collapsed
          open={openFlyout === item.label}
          onOpenChange={(next) => toggleFlyout(item.label, next)}
        >
          {children.map((c) => renderFlyoutLeaf(c))}
        </SidebarFlyout>
      )
    }

    const open = openGroups[item.label] ?? anyChildActive
    return (
      <div key={item.label}>
        <SidebarItem
          icon={<ClipboardList aria-hidden className="size-4" />}
          label={item.label}
          collapsed={false}
          onClick={() =>
            setOpenGroups((prev) => ({ ...prev, [item.label]: !open }))
          }
          trailing={
            <ChevronDown
              aria-hidden
              className={`size-4 text-white/75 transition-transform duration-fast ${
                open ? 'rotate-180' : ''
              }`}
            />
          }
        />
        {open && (
          <div className="mt-1 space-y-1 pl-3">
            {children.map((c) => renderLeaf(c))}
          </div>
        )}
      </div>
    )
  }

  /** 사이드바 하단 고정 계정 메뉴. 어두운 배경 위 항목이라 흰 글씨·white/15 호버를 쓴다. */
  const accountMenu = (
    <Dropdown
      block
      open={profileOpen}
      onClose={() => setProfileOpen(false)}
      align="left"
      placement="right-end"
      // 사이드바에서 뻗는 패널은 폭·간격 규격을 통일한다(게시판·자료실 플라이아웃과 동일).
      // ml-3.5 = 사이드바 패딩(8px) 상쇄 + 바깥 테두리에서 6px.
      className="ml-3.5 min-w-44"
      trigger={
        <button
          type="button"
          aria-label="계정 메뉴"
          title={sidebarCollapsed ? (user?.name ?? '계정 메뉴') : undefined}
          onClick={() => {
            // 계정 메뉴를 열 때는 게시판·자료실 플라이아웃을 닫는다(동시 노출 방지).
            setOpenFlyout(null)
            setProfileOpen((v) => !v)
          }}
          className={cn(
            'flex w-full items-center rounded-radius-md text-left transition-colors duration-fast',
            'hover:bg-white/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20',
            // 접힘 시 메뉴 항목과 동일한 h-10 정사각 규격.
            sidebarCollapsed ? 'h-10 justify-center px-0' : 'gap-2.5 px-2.5 py-2',
          )}
        >
          <Avatar name={user?.name ?? '?'} size="sm" />
          {!sidebarCollapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-semibold text-white">
                {user?.name}
              </span>
              <span className="block truncate text-caption text-white/70">
                {user?.email ?? user?.role}
              </span>
            </span>
          )}
        </button>
      }
    >
      {/* 게시판·자료실 플라이아웃과 동일한 구성: 섹션 라벨 + 아이콘 + 라벨. */}
      <MenuSectionLabel>계정</MenuSectionLabel>
      <DropdownItem
        onClick={() => {
          setProfileOpen(false)
          navigate('/me')
        }}
      >
        <span className="flex items-center gap-2 whitespace-nowrap">
          <UserCog aria-hidden className="size-4 shrink-0 text-gray-400" />
          내 계정 관리
        </span>
      </DropdownItem>
      <DropdownItem onClick={() => void employeeAuth.signOut()}>
        <span className="flex items-center gap-2 whitespace-nowrap">
          <LogOut aria-hidden className="size-4 shrink-0 text-gray-400" />
          로그아웃
        </span>
      </DropdownItem>
    </Dropdown>
  )

  const sidebar = (
    <Sidebar
      collapsed={sidebarCollapsed}
      footer={accountMenu}
      header={
        // 로고(좌) ↔ 접기 토글(우) 한 줄 배치. 접히면 로고를 감추고 토글만 가운데 남긴다.
        <div className="flex w-full items-center justify-between gap-2">
          {!sidebarCollapsed && (
            <Link to="/office" className="min-w-0 shrink">
              <img src={logo} alt="Y&ARCHER" className="h-7 object-contain" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              // 접기/펴기로 트리거 좌표가 바뀌므로 열려 있던 플라이아웃은 닫는다.
              setOpenFlyout(null)
              setSidebarCollapsed(!sidebarCollapsed)
            }}
            className={cn(
              'hidden shrink-0 items-center justify-center rounded-radius-md text-white/70 transition-colors duration-fast',
              'hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20 lg:flex',
              // 접힘 시 메뉴 항목과 동일한 규격(w-full h-10)으로 맞춰 아이콘 중심선을 일치시킨다.
              sidebarCollapsed ? 'h-10 w-full' : 'p-1.5',
            )}
            aria-label={sidebarCollapsed ? '사이드바 열기' : '사이드바 접기'}
            title={sidebarCollapsed ? '사이드바 열기' : '사이드바 접기'}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen aria-hidden className="size-5" strokeWidth={1.8} />
            ) : (
              <PanelLeftClose aria-hidden className="size-5" strokeWidth={1.8} />
            )}
          </button>
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
            current={currentWs.key}
            onSelect={(key) => {
              const w = WORKSPACES.find((x) => x.key === key)
              if (w?.implemented) navigate(w.path)
            }}
          />
          </div>
        )
      }
    >
      {/* 그룹 경계·항목 구분선을 하나의 gap-1 리스트에 평탄화해 SidebarDivider가 어디서든 동일 여백을 내도록 한다. */}
      <div className="flex flex-col gap-1">
        {groups.map((g, gi) => (
          <Fragment key={g.group ?? gi}>
            {gi > 0 && <SidebarDivider collapsed={sidebarCollapsed} />}
            {g.items.map((item) => (
              <Fragment key={item.label}>
                {item.dividerBefore && <SidebarDivider collapsed={sidebarCollapsed} />}
                {renderItem(item)}
              </Fragment>
            ))}
          </Fragment>
        ))}
      </div>
    </Sidebar>
  )

  return (
    <AppShell
      sidebarCollapsed={sidebarCollapsed}
      sidebar={sidebar}
    >
      <Outlet />
    </AppShell>
  )
}
