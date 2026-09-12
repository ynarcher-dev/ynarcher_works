/**
 * 사이드바 글리프 매핑.
 *
 * 세 축이다 — 탭 키(`sidebarIconByTab`), 하위 항목을 여는 그룹 헤더(`sidebarGroupIcon`),
 * 그리고 탭 키가 없는 줄이 쓰는 워크스페이스 글리프(`sidebarIconByWorkspace`).
 * 셸(`WorksLayout`)에서 떼어 둔 것은 이 표가 메뉴가 늘 때마다 함께 자라기 때문이다.
 */
import {
  Award,
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  Download,
  Folder,
  Globe,
  Handshake,
  LayoutGrid,
  Lightbulb,
  Link2,
  LockKeyhole,
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
  UserRoundCheck,
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
  Sprout,
  FileSpreadsheet,
  FileText,
  ScanLine,
  Tag,
  Map,
  MapPin,
  Flag,
  Milestone,
  Activity,
  HandCoins,
  PackageOpen,
  CalendarClock,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const sidebarIconByTab: Record<string, LucideIcon> = {
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

  // NETWORKS 9종 네트워크(원장별 메뉴는 2026-08-20에 내렸으나, 상세·HUB 등 다른 화면이
  // 같은 탭 키를 쓰므로 매핑은 남긴다)
  van: Handshake,
  exp: Star,
  global: Globe,
  // 글로벌 '내 업로드 DB' — 같은 역할(내 것)이라 국내 `mine`과 같은 글리프를 쓰고,
  // 국내/글로벌은 라벨과 구분선이 가른다.
  global_mine: User,
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

  // FUND 펀드 종류별 메뉴(`ac_fund`·`vc_fund`)는 2026-08-20에 목록 '구분' 필터로 내려가
  // 매핑도 함께 지웠다(`pe_fund`는 M&A 사업구분 키와 같아 위에 남아 있다).

  // HUB 그룹 4: 실적 정보
  fund: WalletCards,
  management: ChartNoAxesCombined,

  // 기존 탭 매핑 유지
  search: Search,
  ranking: Award,
  directory: Users,
  merge: Link2,
  creators: UserCog,
  bulk: Upload,
  kanban: BadgeCheck,
  matching: LayoutGrid,
  permissions: LockKeyhole,
  boards: ClipboardList,
  // 게스트 계정 관리: 사람(User) 계열이되 인사(User)·생성자(UserCog)와 다른 글리프를 쓴다 —
  // 사이드바에서 세 메뉴가 같은 일로 읽히면 안 된다.
  'guest-accounts': UserRoundCheck,
  sensitive: EyeOff,
  audit: ReceiptText,
  downloads: Download,
  approval: BadgeCheck,
  // 양식 관리는 결재 그 자체가 아니라 "무엇을 입력받을지"를 정하는 자리라 결재 도장(BadgeCheck)과
  // 다른 글리프를 쓴다 — 사이드바에서 두 메뉴가 같은 일로 읽히면 안 된다.
  'approval-forms': FileSpreadsheet,
  'approval-stats': BarChart3,
  outbound: PackageOpen,
  rooms: DoorOpen,
  minutes: FileText,
  hr: User,
  attendance: CalendarClock,
  finance: WalletCards,
  assets: BriefcaseBusiness,
  departments: Network,
  branches: Building,
  kpi: Gauge,

  // STARTUP 워크스페이스
  invested: Coins,
  incubated: Sprout,
  discovered: Rocket,
  archerscan: ScanLine,

  // ADMIN '태그 관리' 그룹(tagConfig.ts의 TAG_CONFIGS). 한 그룹 안에서 나란히 놓이므로
  // 다른 메뉴와 겹치더라도 그룹 내부에서는 서로 다른 아이콘을 쓴다.
  // 직책·직급·호봉은 MANAGEMENT에서 이 그룹으로 이관됐다(2026-08-03).
  positions: UserCog,
  ranks: Medal,
  pay_steps: Layers,
  industries: Factory,
  fields: Tag,
  categories: Shapes,
  regions: Map,
  countries: Flag,
  investment_stages: Milestone,
  company_categories: Building2,
  company_statuses: Activity,
  investment_methods: HandCoins,
  locations: MapPin,
}

/** 하위 항목을 여는 아코디언 그룹 헤더의 아이콘(SubNavItem.groupIconKey). */
export const sidebarGroupIcon: Record<string, LucideIcon> = {
  tags: Tags,
}

/**
 * 탭 키가 없는 메뉴(목록 하나뿐인 워크스페이스)의 아이콘.
 *
 * 2026-09-05에 STARTUP·NETWORKS·FUND·사업 3종의 '내 ~'/'전체 ~' 두 줄이 한 줄로 합쳐지며
 * 이 줄들은 탭 키를 잃었다(범위는 `?scope=`가 싣는다). 탭 기반 매핑이 걸리지 않으므로
 * 워크스페이스 글리프가 그 줄의 아이콘이 된다.
 */
export const sidebarIconByWorkspace: Record<string, LucideIcon> = {
  startup: Rocket,
  ac: Target,
  fund: WalletCards,
  project: Folder,
  mna: BriefcaseBusiness,
  networks: Network,
}
