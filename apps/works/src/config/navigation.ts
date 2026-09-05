import type { WorkspaceKey } from '@/auth/types'
import { ADMIN_TAG_CONFIGS } from '@/features/admin/tagConfig'

/** 사이드바 세부 메뉴 항목. tab은 페이지 내부 섹션을 제어하는 `?tab=` 쿼리 값. */
export interface SubNavItem {
  label: string
  /** 미지정 시 워크스페이스 루트를 의미한다(대시보드 하나·목록 하나뿐인 워크스페이스). */
  tab?: string
  /**
   * 하위 항목. 지정 시 이 항목은 사이드바 한 줄로 남고 클릭하면 우측 플라이아웃으로 펼쳐진다
   * (아래로 펼치지 않는다 — 항목이 늘어도 사이드바 길이가 변하지 않아야 한다).
   */
  children?: SubNavItem[]
  /**
   * 하위 항목을 가진 상위 항목의 아이콘 키(WorksLayout `sidebarGroupIcon`).
   * 상위 항목은 tab이 없어 탭 기반 아이콘 매핑이 걸리지 않으므로 별도로 지정한다.
   */
  groupIconKey?: string
  /**
   * 하위 항목을 런타임 게시판 레지스트리에서 주입(아코디언 없이 상위 단독 항목으로 평탄 나열).
   * 그룹핑 축은 게시 종류(kind) 하나다 — 설계: docs/docs_planning/3_1_1_board_archive_notice.md
   * - 'boards': 게시판(kind = POST)
   * - 'archives': 자료실(kind = ARCHIVE)
   */
  dynamicKey?: 'boards' | 'archives'
  /** 동적 항목의 아이콘 키(boardIcons.ts). 지정 시 tab 기반 매핑보다 우선한다. */
  iconKey?: string
  /** 이 항목 위에 같은 그룹 내 구분선을 그린다(그룹은 유지한 채 항목 사이만 시각적으로 나눌 때). */
  dividerBefore?: boolean
}

/** 사이드바 메뉴 그룹(그룹명 헤더 + 항목들). */
export interface SubNavGroup {
  group?: string
  items: SubNavItem[]
}

/**
 * 원장 목록 워크스페이스(STARTUP·NETWORKS·FUND·사업 3종)에는 탭 키가 없다.
 *
 * 2026-09-05에 '내 ~'/'전체 ~' 두 줄이 메뉴 한 줄 + 목록 범위 토글로 합쳐지면서 `?tab=`이
 * 하던 일(범위 전환)을 `?scope=`가 넘겨받았다(`lib/listScope`). 옛 탭 키(`mine`·`all`·
 * `dashboard`·구분별 값)를 현재 키로 옮기던 `resolveListTab`·`LIST_ALL_TAB`은 함께 걷었다 —
 * 이제 옛 주소는 각 목록 화면이 자기 규칙으로 흡수한다(`?tab=mine`만 내 범위, 나머지는 전체).
 */

/**
 * 원장 목록 메뉴 라벨 — 각 워크스페이스에 한 줄씩이다.
 *
 * 페이지 제목도 이 상수를 읽는다 — 사이드바 라벨과 제목이 어긋나면 눌러 들어간 메뉴와 도착한
 * 화면의 이름이 달라진다. 범위(내 것/전부)는 이 이름에 담지 않는다: 2026-09-05에 메뉴 두
 * 줄을 한 줄로 합치면서 범위는 목록 안의 토글이 답하게 했다.
 *
 * 사업 3종이 한 라벨을 공유하는 것은 2026-08-20 결정의 연장이다 — 세 워크스페이스는 같은 원장
 * 구조·같은 화면을 쓰므로 메뉴 이름까지 같아야 워크스페이스를 옮겨도 손이 같은 자리를 찾는다.
 * 도메인 명칭(사업·딜)은 목록 안쪽 문구(`entityNoun`)가 계속 답한다.
 */
export const PROGRAM_LIST_LABEL = '프로젝트'
export const NETWORKS_LIST_LABEL = '네트워크 DB'
export const STARTUP_LIST_LABEL = '스타트업 DB'
export const FUND_LIST_LABEL = '운용펀드'

/**
 * 사업 워크스페이스(AC/M&A/PROJECT) 공용 사이드바 구성 — `프로젝트` 한 줄.
 *
 * 2026-08-03: 사업구분(카테고리)별 세분화 항목을 내렸다. 분류를 메뉴로 두면 그것이
 * '어디에 있는가'가 되어 상태·부서 같은 다른 축과 함께 걸 수 없고(공공 사업 중 진행중만 같은
 * 질문에 답할 수 없다), 분류를 하나 늘릴 때마다 사이드바가 길어진다. 이제 사업구분은 목록의
 * 필터 축 하나이며, 미분류 건은 그 필터의 '미지정' 선택지가 답한다 — 종전에 '기타'가 맡던
 * 사각지대 방어는 `전체 ~`가 이미 구분 무관 전부를 보여주므로 필요 없다.
 */
function programSubnav(): SubNavGroup[] {
  return [
    {
      // 한 줄이다(2026-09-05). 범위(내 프로젝트/전체 프로젝트)는 메뉴가 아니라 목록 상단
      // 토글이 답한다 — 사업구분(2026-08-03)이 먼저 밟은 길과 같은 이유로, 범위를 메뉴로
      // 두면 그것이 '어디에 있는가'가 되어 상태·부서 같은 다른 축과 함께 걸 수 없다.
      items: [{ label: PROGRAM_LIST_LABEL }],
    },
  ]
}

/**
 * 워크스페이스별 좌측 사이드바 세부 메뉴.
 * 근거: 2_app_layout_navigation.md §3.1 (Contextual Sidebar Menu)
 */
export const WORKSPACE_SUBNAV: Partial<Record<WorkspaceKey, SubNavGroup[]>> = {
  startup: [
    {
      // 한 줄이다(2026-09-05 '내 업로드 DB'/'스타트업 DB' 통합). 범위는 목록 상단 토글이
      // 답하고, 구분(투자·보육·발굴·기타)은 2026-08-20에 이미 목록의 필터 축이 되었다 —
      // 분류든 범위든 메뉴로 두면 그것이 '어디에 있는가'가 되어 소재지·단계 같은 다른 축과
      // 함께 걸 수 없다(보육기업 중 시드 단계만, 같은 질문에 답할 수 없다).
      //
      // 대용량 업로드는 목록 상단의 버튼으로 들어간다(/startup/bulk) — 메뉴로 두면 어느
      // 원장으로 들어가는 업로드인지가 이름에 드러나지 않는다. 아처스캔은 화면이 준비되기
      // 전까지 메뉴에서 내린다(라우팅 ?tab=archerscan은 그대로 살아 있다).
      items: [{ label: STARTUP_LIST_LABEL }],
    },
  ],
  // NETWORKS: 메뉴 한 줄이다.
  //
  // 2026-09-04 원장 통합으로 국내/글로벌 쌍이 하나로 합쳐졌고, 2026-09-05에 남아 있던
  // '내 업로드 DB'/'전체 네트워크' 쌍도 한 줄로 합쳤다. 둘은 같은 원장을 같은 열·같은 필터로
  // 보며 범위만 달랐는데, 범위를 메뉴로 두면 그것이 '어디에 있는가'가 되어 지역·구분과 같은
  // 축으로 함께 걸 수 없고 메뉴를 옮길 때마다 검색어와 필터가 사라진다. 지역(2026-09-04)·
  // 구분(2026-08-20)이 먼저 밟은 길과 같다 — 범위는 자리가 아니라 축이므로 목록 상단의
  // 토글(내 네트워크 / 전체 네트워크)이 답한다.
  //
  // 탭 키를 두지 않는다 — 이 워크스페이스의 목록은 하나뿐이라 `/networks`가 곧 그 화면이고,
  // 범위는 `?scope=`가 싣는다. 대용량 업로드도 메뉴가 아니라 목록 상단 버튼으로 들어간다
  // (/networks/bulk) — 메뉴로 두면 어느 원장으로 들어가는 업로드인지가 이름에 드러나지 않는다.
  networks: [
    {
      items: [{ label: NETWORKS_LIST_LABEL }],
    },
  ],
  ac: programSubnav(),
  // FUND: 메뉴 한 줄이다(2026-09-05 '내 운용펀드'/'전체 운용펀드' 통합) — 범위는 목록 상단
  // 토글이 답한다. 펀드 종류(AC·VC·PE)는 2026-08-20에 이미 목록의 '구분' 필터로 내려갔다:
  // 분류를 메뉴로 두면 재원·성격·상태와 함께 걸 수 없고(VC 펀드 중 모태 재원만, 같은 질문에
  // 답할 수 없다), 구분이 비어 있는 펀드는 어느 메뉴에도 나타나지 않아 아예 보이지 않았다.
  fund: [
    {
      items: [{ label: FUND_LIST_LABEL }],
    },
  ],
  // M&A/PE는 AC와 동일한 사업 원장 구조(features/program)를 공유한다.
  mna: programSubnav(),
  admin: [
    {
      group: '시스템 관리',
      items: [
        { label: '권한 제어 콘솔', tab: 'permissions' },
        { label: '게시판 관리', tab: 'boards' },
        { label: '회의실 관리', tab: 'rooms' },
        // 결재 양식: 전자결재가 무엇을 입력받을지(필드 정의) 정하는 곳. 문서 번호 약칭도 여기서 정한다.
        { label: '결재 양식 관리', tab: 'approval-forms' },
        // 사업 운영 모듈의 템플릿 카탈로그. 게시판·회의실과 같은 성격이되, 끄는 것이 기존
        // 인스턴스에 미치는 영향이 축마다 갈린다(3_2_1) — 카탈로그는 새로 못 만들게만 하고
        // 노출 상한은 이미 열린 것까지 닫는다.
        { label: '모듈 관리', tab: 'modules' },
        // 게스트 계정 원장. 계정을 만드는 자리가 아니라(계정은 사업 담당자가 명부에서 로그인을
        // 열 때 생긴다) 전사에 걸친 계정을 세우고 재우는 자리다 — 사업의 문은 담당자가,
        // 계정 자체는 ADMIN이 소유한다. 인사 관리는 임직원만 답하므로 게스트는 여기로만 온다.
        { label: '게스트 계정 관리', tab: 'guest-accounts' },
        // 전사 기준정보 태그는 종류가 계속 늘어나므로 사이드바에 평탄 나열하지 않고
        // 상위 한 줄로 두고 우측 플라이아웃으로 편다(게시판·자료실과 같은 조작감).
        // 항목은 TAG_CONFIGS에서 파생되므로 태그를 추가할 때 이 파일은 손대지 않는다.
        {
          label: '태그 관리',
          groupIconKey: 'tags',
          dividerBefore: true,
          children: ADMIN_TAG_CONFIGS.map((c) => ({ label: c.menuLabel, tab: c.tab })),
        },
        { label: '민감정보 관리', tab: 'sensitive', dividerBefore: true },
        { label: '중복 병합 검증', tab: 'merge' },
        // 생성자(created_by) 강제 교체. 권한 축이 아니라 표기·소속 정리용 관리자 오버라이드다.
        { label: '생성자 교체', tab: 'creators' },
        { label: '감사 로그 모니터', tab: 'audit' },
        { label: '다운로드 사유 로그', tab: 'downloads' },
      ],
    },
  ],
  // PROJECT도 AC와 동일한 사업 원장 구조(features/program)를 공유한다.
  project: programSubnav(),
  // OFFICE: 임직원 정보·전사 캘린더 + 게시판(공지사항 고정 + 일반, 아코디언 없이 평탄 나열).
  // 신규 게시판은 모두 이곳에 생성·노출된다.
  office: [
    {
      items: [
        // 대시보드를 최상단에 배치. AI 에이전트·전사 캘린더는 사이드바가 아니라 상단바
        // 전역 진입점(우측 슬라이드오버)에서만 연다.
        { label: '대시보드', tab: 'dashboard' },
        // 전사 인적·조직 정보 블록(조회 전용). 원장은 MANAGEMENT가 갖고 OFFICE는 확인만 한다.
        // 임직원 정보 한 메뉴가 조직(목록)과 사람(상세)을 함께 답한다 — 구 '부서 정보'는 여기에 합쳐졌다.
        { label: '임직원 정보', tab: 'managers', dividerBefore: true },
        { label: '지사 정보', tab: 'branches' },
        // 위 인적·조직 블록을 떼어내는 구분선. 전자결재 워크스페이스에서 통합 이관한
        // 결재·거래처 블록을 공간·회의 블록보다 앞에 둔다.
        // 결재는 전사 업무라 OFFICE가 화면을 갖는다. 다만 결재된 '금액'을 모아 보는 일은
        // 재무 관리와 같은 축이라 MANAGEMENT '결재 금액 집계'가 소유한다.
        { label: '전자결재', tab: 'approval', dividerBefore: true },
        // 거래처 조회 전용. 원장·등록은 MANAGEMENT '거래처 정보'가 소유하고, 여기서 읽는 것은
        // 가려진 뷰(계좌번호 뒤 4자리·개인 생년월일은 연도까지, 증빙 서류 없음)다.
        { label: '거래처 정보', tab: 'clients' },
        // 자산·공간·회의는 사내 자원을 쓰는 일 한 블록이다 — 셋 사이는 끊지 않고 위 결재·거래처
        // 블록과만 구분선으로 나눈다. 뒤는 아래 고정 게시판 그룹 경계가 끊는다.
        { label: '자산 현황', tab: 'outbound', dividerBefore: true },
        { label: '회의실 예약', tab: 'rooms' },
        // 회의록은 STARTUP에서 이관했다.
        { label: '회의록 작성', tab: 'minutes' },
        // 게스트 계정: 발급·조회·재설정 안내의 전원용 창구(2026-09-05 신설). ADMIN 워크스페이스는
        // 관리자만 들어가는데 발급은 내부 사용자 전원의 일이라 전사 허브에 둔다. 계정 정지·해제와
        // 연락처 원본은 ADMIN 화면에만 있다. 근거: 3_9_1 §11.1
        { label: '게스트 계정', tab: 'guest-accounts', dividerBefore: true },
      ],
    },
    {
      // 게시 블록(위 업무 블록과는 그룹 경계 구분선으로만 나눈다).
      // 공지사항은 게시판이 아니라 전체 공지(global_notice) 게시글을 모아 보여주는 뷰이며,
      // 레지스트리와 무관한 고정 라우트이므로 dynamicKey 없이 단독 항목으로 둔다.
      // 게시판(POST)·자료실(ARCHIVE)은 각각 상위 메뉴 한 줄로 두고, 클릭하면 우측 플라이아웃에
      // 등록된 목록을 펼친다. 게시판이 늘어나도 사이드바가 길어지지 않는다.
      group: '게시',
      items: [
        { label: '공지사항', tab: 'notices', iconKey: 'megaphone' },
        { label: '게시판', dynamicKey: 'boards' },
        { label: '자료실', dynamicKey: 'archives' },
      ],
    },
  ],
  management: [
    {
      group: '경영지원',
      items: [
        { label: '경영 현황', tab: 'dashboard' },
        { label: '조직 관리', tab: 'departments', dividerBefore: true },
        // 지사 원장(지사명·주소·전화번호·상주인력)의 단일 세팅 지점. 조직 관리와 같은 조직
        // 축이라 MANAGEMENT가 소유하고, OFFICE '지사 정보'와 회의실 예약의 지사 탭이 조회한다.
        { label: '지사 관리', tab: 'branches' },
        { label: '자산 관리', tab: 'assets' },
        // 직책·직급·호봉 태그는 ADMIN '태그 관리'로 이관했다(2026-08-03) — 쓰기 정책이
        // is_admin() 하나뿐이라 여기 두면 MANAGEMENT 사용자는 볼 수만 있었다.
        { label: '인사 관리', tab: 'hr', dividerBefore: true },
        // 근태 원장(정책·상태·일별 기록)의 소유 자리. OFFICE 대시보드 '근무체크' 위젯은
        // 본인 기록을 찍기만 하고, 판독·정정은 여기서만 한다.
        { label: '근태 관리', tab: 'attendance' },
        { label: '재무 관리', tab: 'finance', dividerBefore: true },
        // 거래처 원장(코드·상호·구분·등록번호·계좌·증빙)의 단일 세팅 지점. 돈이 나가는 상대를
        // 다루는 일이라 재무 블록에 둔다. OFFICE '거래처 정보'는 이 원장을 조회할 자리이며
        // 노출 범위(계좌·등록번호 마스킹)를 정한 뒤 연결한다.
        { label: '거래처 정보', tab: 'partners' },
        // 승인된 결재 문서의 금액을 항목·문서·월로 모은다(양식의 금액 필드가 원천).
        // KPI 관리와 같은 성과·집계 블록에 둔다.
        { label: 'KPI 관리', tab: 'kpi' },
        { label: '결재 금액 집계', tab: 'approval-stats' },
      ],
    },
  ],
}

/** 그룹 목록에서 기본 활성 탭(첫 tab 보유 항목, 하위 항목 포함)을 반환. 없으면 undefined. */
export function firstTab(groups: SubNavGroup[] | undefined): string | undefined {
  for (const g of groups ?? []) {
    for (const item of g.items) {
      if (item.tab) return item.tab
      const childTab = item.children?.find((c) => c.tab)?.tab
      if (childTab) return childTab
    }
  }
  return undefined
}

/** 그룹 목록에 존재하는 모든 탭 키 집합(하위 항목 포함). */
function allTabs(groups: SubNavGroup[] | undefined): Set<string> {
  const tabs = new Set<string>()
  for (const g of groups ?? []) {
    for (const item of g.items) {
      if (item.tab) tabs.add(item.tab)
      for (const c of item.children ?? []) if (c.tab) tabs.add(c.tab)
    }
  }
  return tabs
}

/**
 * 상세 라우트 경로에서 활성 탭을 유추한다.
 * 예: pathname `/startup/invested/123`, wsPath `/startup` → 세그먼트 `invested`.
 * 해당 세그먼트가 사이드바 탭으로 존재할 때만 반환하고, 아니면 undefined.
 */
export function pathTabOf(
  pathname: string,
  wsPath: string,
  groups: SubNavGroup[] | undefined,
): string | undefined {
  const rest = pathname.slice(wsPath.length).replace(/^\/+/, '')
  const seg = rest.split('/')[0]
  if (!seg) return undefined
  return allTabs(groups).has(seg) ? seg : undefined
}
