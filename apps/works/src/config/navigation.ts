import type { WorkspaceKey } from '@/auth/types'

/** 사이드바 세부 메뉴 항목. tab은 페이지 내부 섹션을 제어하는 `?tab=` 쿼리 값. */
export interface SubNavItem {
  label: string
  /**
   * 화면과 주소를 아직 만들지 않은 메뉴 자리. 클릭하면 이동하지 않고 준비 중 안내만 띄운다.
   * 실제 화면을 연결하는 날 이 값을 걷고 `tab` 또는 `path`를 지정한다.
   */
  comingSoon?: boolean
  /** 워크스페이스 루트·탭이 아닌 공용 절대 경로. 하단 GUEST 계정 창구가 이 값을 쓴다. */
  path?: string
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
   * 하위 항목을 런타임 게시판 레지스트리에서 주입한다. OFFICE 1차 사이드바에는 상위 메뉴만
   * 세우고, 실제 게시판 목록은 화면 안쪽의 2차 사이드바에서 보여준다.
   * 그룹핑 축은 게시 종류(kind) 하나다 — 설계: docs/docs_planning/3_1_1_board_archive_notice.md
   * - 'boards': 게시판(kind = POST)
   * - 'archives': 자료실(kind = ARCHIVE)
   */
  dynamicKey?: 'boards' | 'archives'
  /** 동적 항목의 아이콘 키(boardIcons.ts). 지정 시 tab 기반 매핑보다 우선한다. */
  iconKey?: string
  /**
   * 탭 없는 줄의 글리프 키(`sidebarIconByTab`).
   *
   * 탭이 없으면 글리프는 그 구획의 워크스페이스 글리프가 된다 — 구획 하나에 줄 하나일 때는
   * 그것이 맞지만, 한 항목이 같은 권한 키의 구획을 여럿 덮으면(M&A/PE의 딜·BUYER·SELLER)
   * 세 줄이 같은 아이콘으로 선다. 그때만 줄이 자기 글리프를 직접 고른다.
   */
  glyphKey?: string
  /** 이 항목 위에 `그룹명 + 선` 구분자를 그린다. 값은 새로 시작하는 그룹명이다. */
  dividerBefore?: string
  /**
   * 사이드바 맨 아래 고정 영역에 세운다(목록이 길어져 스크롤이 생겨도 자리를 지킨다).
   *
   * 목록 안이 아니라 그 아래에 두는 줄은 '이 워크스페이스의 무엇'이 아니라 **거기서 여는
   * 창구**다 — GUEST 계정 조회가 그렇다. 원장 줄 사이에 끼면 위아래 어느 원장의 것인지 화면이
   * 답하지 못하고, 목록 끝에 그냥 붙이면 원장이 늘 때마다 자리가 밀린다.
   */
  pinBottom?: boolean
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
 * 사업부는 `프로젝트`, M&A팀은 `M&A 프로젝트`로 부른다. 두 워크스페이스가 같은 목록 화면을 쓰더라도
 * 실제 조직에서 부르는 대상이 다르므로 메뉴 이름은 각 구획의 말을 따른다. 목록 안쪽 문구도
 * 각 config의 `entityNoun`이 같은 이름을 이어받는다.
 *
 * 2026-09-06에 이 라벨을 워크스페이스별 조직명(AC사업 / 글로벌·신사업 / M&A팀·PE / 투자실)으로
 * 갈랐다가 2026-09-07에 되돌렸다 — 가른 것은 실행 라인 넷이 BUSINESS 한 항목 아래 나란히 서서
 * '어느 원장인가'를 줄 이름이 홀로 답해야 했기 때문이고, 스위처가 다시 넷으로 갈리면서 그 답이
 * 항목명으로 돌아왔다. 줄 이름이 그 답을 겸하면 워크스페이스마다 같은 자리의 이름이 달라진다.
 */
export const PROGRAM_LIST_LABEL = '프로젝트'
const MNA_PROGRAM_LIST_LABEL = 'M&A 프로젝트'
// 줄 이름에 `DB` 꼬리를 두지 않는다(2026-09-13 사용자 지정 — 스위처 항목을 `데이터베이스`로
// 바꾸면서 함께 떼었다). 꼬리가 맡던 말은 '이 자리가 무엇을 하는 곳인가'였다: 원장을 보는
// 자리이지 그 대상으로 업무를 하는 화면이 아니다(같은 스타트업을 다루는 자리가 프로젝트
// 명부에도 있다). 지금은 그 답을 항목명이 하므로, 꼬리를 함께 달면 한 자리에서 같은 말을 두 번
// 한다(`데이터베이스 > 스타트업 DB`). 2026-09-06에 걷었다가 2026-09-09에 되살린 이력이 있고,
// 되살린 근거는 "스위처가 갈려 각 줄이 자기 항목 아래 홀로 선다"였는데 이 두 줄은 그사이 다시
// 한 항목 아래로 돌아왔다. M&A 두 줄의 이름은 여기가 아니라 각자의 원장 설정
// (MaPartyConfig.listLabel)이 갖는다.
export const NETWORKS_LIST_LABEL = '네트워크'
export const STARTUP_LIST_LABEL = '스타트업'
export const FUND_LIST_LABEL = '운용펀드'
/** 모든 사업·원장을 함께 보는 전사 GUEST 계정 관리 창구. */
export const GUEST_ACCOUNT_READ_LABEL = 'GUEST 계정 관리'

/**
 * 프로젝트 워크스페이스 공용 사이드바 구성 — 구획에 따라 `프로젝트` 또는 `M&A 프로젝트` 한 줄.
 *
 * 2026-08-03: 사업구분(카테고리)별 세분화 항목을 내렸다. 분류를 메뉴로 두면 그것이
 * '어디에 있는가'가 되어 상태·부서 같은 다른 축과 함께 걸 수 없고(공공 사업 중 진행중만 같은
 * 질문에 답할 수 없다), 분류를 하나 늘릴 때마다 사이드바가 길어진다. 이제 사업구분은 목록의
 * 필터 축 하나이며, 미분류 건은 그 필터의 '미지정' 선택지가 답한다 — 종전에 '기타'가 맡던
 * 사각지대 방어는 `전체 ~`가 이미 구분 무관 전부를 보여주므로 필요 없다.
 */
function programSubnav(
  options: { groupLabel?: string; listLabel?: string } = {},
): SubNavGroup[] {
  return [
    {
      group: options.groupLabel ?? '프로젝트 관리',
      // 한 줄이다(2026-09-05). 범위(내 것/전체)는 메뉴가 아니라 목록 상단
      // 토글이 답한다 — 사업구분(2026-08-03)이 먼저 밟은 길과 같은 이유로, 범위를 메뉴로
      // 두면 그것이 '어디에 있는가'가 되어 상태·부서 같은 다른 축과 함께 걸 수 없다.
      items: [
        { label: options.listLabel ?? PROGRAM_LIST_LABEL },
      ],
    },
  ]
}

/**
 * 워크스페이스별 좌측 사이드바 세부 메뉴 — 키는 여전히 권한 구획(`WorkspaceKey`)이다.
 *
 * 2026-09-06에 STARTUP·NETWORKS가 스위처 항목 하나(DATABASE)로 합쳐졌지만, 합친 것은 자리뿐이라
 * 이 표는 갈린 채로 둔다: 사이드바에 어느 줄이 서는지는 구획마다 자기 읽기 권한이 답하고
 * (`app/workspaceNav.ts`가 읽을 수 있는 구획의 줄만 모아 세운다), 그 판정은 원장 성격이 다른
 * 두 워크스페이스에서 함께 묶일 수 없다.
 */
export const WORKSPACE_SUBNAV: Partial<Record<WorkspaceKey, SubNavGroup[]>> = {
  startup: [
    {
      group: '데이터 원장',
      // 한 줄이다(2026-09-05 '내 업로드 DB'/'스타트업 DB' 통합). 범위는 목록 상단 토글이
      // 답하고, 구분(투자·보육·발굴·기타)은 2026-08-20에 이미 목록의 필터 축이 되었다 —
      // 분류든 범위든 메뉴로 두면 그것이 '어디에 있는가'가 되어 소재지·단계 같은 다른 축과
      // 함께 걸 수 없다(보육기업 중 시드 단계만, 같은 질문에 답할 수 없다).
      //
      // 대용량 업로드는 목록 상단의 버튼으로 들어간다(/startup/bulk) — 메뉴로 두면 어느
      // 원장으로 들어가는 업로드인지가 이름에 드러나지 않는다. 아처스캔은 화면이 준비되기
      // 전까지 메뉴에서 내린다(라우팅 ?tab=archerscan은 그대로 살아 있다).
      // 계정생성 줄은 사업 워크스페이스가 갖는다 — 근거는 programSubnav 주석.
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
      group: '데이터 원장',
      items: [{ label: NETWORKS_LIST_LABEL }],
    },
  ],
  // GUEST 계정 창구는 특정 워크스페이스의 하위 탭이 아니라 사업부·M&A팀·투자실이 함께 쓰는
  // 절대 경로다. 그래서 이 표에 복제하지 않고 `buildNavGroups`가 세 실행 워크스페이스의
  // 사이드바 하단에 한 번씩 붙인다. URL과 계정 원장은 하나인 채 접근 동선만 업무 가까이에 둔다.
  //
  // FUND가 2026-09-10에 합류했다(사용자 지적 "INVESTMENT에는 사이드바 하단에 안 보여").
  // 종전 주석은 "명부에 해당하는 것이 없어 어디에도 연결할 수 없는 계정만 생긴다"였는데,
  // 2026-09-09에 조합이 게스트 맥락 셋째가 되면서 그 전제가 사라졌다 — **명단은 포트폴리오가
  // 답하고**(`rosterSource.kind = 'table'`), 서버의 `guest_accounts_list`도 그때 조합을
  // 세도록 넓혀 두었다. 창구만 없어서, 조합에 게스트를 연 담당자가 그 계정을 되찾을 자리가
  // 없었다.
  project: programSubnav(),
  // FUND: 실제 연결 화면은 운용펀드 한 줄이고, 투자심사 둘과 반기/온기보고는 후속 화면이
  // 들어올 독립 메뉴 자리만 먼저 세운다. 운용펀드의 범위는 목록 상단 토글이 답한다.
  // 펀드 종류(AC·VC·PE)는 2026-08-20에 이미 목록의 '구분' 필터로 내려갔다:
  // 분류를 메뉴로 두면 재원·성격·상태와 함께 걸 수 없고(VC 펀드 중 모태 재원만, 같은 질문에
  // 답할 수 없다), 구분이 비어 있는 펀드는 어느 메뉴에도 나타나지 않아 아예 보이지 않았다.
  fund: [
    {
      group: '펀드 관리',
      items: [
        { label: FUND_LIST_LABEL },
        {
          label: '예비투자심사',
          glyphKey: 'preliminary-investment-review',
          comingSoon: true,
          dividerBefore: '투자심사',
        },
        { label: '본투자심사', glyphKey: 'investment-review', comingSoon: true },
        {
          label: '반기/온기보고',
          glyphKey: 'periodic-report',
          comingSoon: true,
          dividerBefore: '보고',
        },
      ],
    },
  ],
  // M&A/PE는 AC와 동일한 사업 원장 구조(features/program)를 공유한다.
  //
  // 이 표가 답하는 것은 딜 목록 한 줄뿐이다. 같은 항목 아래 서는 원장 두 줄(M&A BUYER·
  // SELLER)은 여기 없고 각자의 구획이 직접 갖는다(`WorkspaceSection.subnav`) — 이 표의
  // 열쇠는 권한 키인데 세 구획의 키가 모두 `mna`라, 여기 적으면 세 자리에 같은 줄이 함께
  // 서서 어느 쪽을 눌러도 같은 곳으로 가는 메뉴가 아홉이 된다.
  mna: programSubnav({ groupLabel: '딜 관리', listLabel: MNA_PROGRAM_LIST_LABEL }),
  admin: [
    {
      group: '권한·보안',
      items: [
        { label: '권한 제어 콘솔', tab: 'permissions' },
        // 화면별 개인정보 마스킹은 데이터 정리 기능이 아니라 누가 무엇을 볼지 정하는 노출 통제다.
        { label: '민감정보 관리', tab: 'sensitive' },
        { label: '게시판 관리', tab: 'boards', dividerBefore: '운영 설정' },
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
        // 전사 기준정보 태그는 1차 사이드바에 종류를 펼치지 않는다. 이 한 줄로 들어간 뒤
        // 게시판과 같은 콘텐츠 영역의 2차 사이드바에서 종류를 고른다.
        {
          label: '태그 관리',
          tab: 'tags',
          dividerBefore: '기준정보',
        },
        { label: '중복 병합 검증', tab: 'merge', dividerBefore: '데이터 관리' },
        // 생성자(created_by) 강제 교체. 권한 축이 아니라 표기·소속 정리용 관리자 오버라이드다.
        { label: '생성자 교체', tab: 'creators' },
        { label: '감사 로그 모니터', tab: 'audit', dividerBefore: '감사·로그' },
        { label: '다운로드 사유 로그', tab: 'downloads' },
      ],
    },
  ],
  // OFFICE: 임직원 정보·전사 일정 + 게시판(공지사항 고정 + 일반, 아코디언 없이 평탄 나열).
  // 신규 게시판은 모두 이곳에 생성·노출된다.
  office: [
    {
      group: '일정',
      items: [
        // 전사 일정은 공용 오피스의 기본 진입점이다.
        { label: '전사 일정', tab: 'calendar' },
        // 전사 원장 조회 블록. 원장은 모두 MANAGEMENT가 갖고 OFFICE는 확인만 한다 —
        // 사람(임직원)·자리(지사)·물건(자산)이 한 블록에 서는 축은 "회사에 무엇이 있나"이다.
        // 임직원 정보 한 메뉴가 조직(목록)과 사람(상세)을 함께 답한다 — 구 '부서 정보'는 여기에 합쳐졌다.
        { label: '임직원 정보', tab: 'managers', dividerBefore: '회사정보' },
        { label: '지사 정보', tab: 'branches' },
        { label: '자산 현황', tab: 'outbound' },
        // 거래처 정보는 여기 두지 않는다(2026-09-06) — 원장·등록·조회를 MANAGEMENT '거래처 정보'
        // 한 자리에 모은다. 같은 원장을 두 자리에서 열면 담당자가 어디서 봐야 하는지를 매번
        // 고르게 되고, 조회면은 가린 값 때문에 원장과 다른 답을 하는 화면이 된다.
        // 공간·회의 블록. 부서별 주간 회의록은 개인의 소속 부서 맥락에서 작성하므로
        // `내 오피스 > 부서업무`가 소유하고, 여기는 전사 공용 회의 기록만 둔다.
        { label: '회의실 예약', tab: 'rooms', dividerBefore: '회의' },
        // 회의록은 STARTUP에서 이관했다.
        { label: '회의록 작성', tab: 'minutes' },
      ],
    },
    {
      // 게시 블록(위 업무 블록과는 그룹 경계 구분선으로만 나눈다).
      // 공지사항은 전체 공지(global_notice) 게시글을 모아 보여주는 고정 뷰이며, 1차 메뉴에서
      // 게시판과 갈라놓지 않고 게시판 2차 사이드바의 첫 항목으로 둔다.
      // 게시판(POST)·자료실(ARCHIVE)은 각각 1차 메뉴 한 줄로 두고, 등록된 목록은 전자결재의
      // 문서함처럼 화면 안쪽 2차 사이드바에서 고른다. 게시판이 늘어나도 1차 사이드바는 길어지지 않는다.
      group: '게시',
      items: [
        { label: '게시판', tab: 'boards', dynamicKey: 'boards' },
        { label: '자료실', tab: 'archives', dynamicKey: 'archives' },
      ],
    },
  ],
  management: [
    {
      group: '경영관리',
      items: [
        // 경영실은 열 개 기능을 감추지 않고 모두 노출하되, 경영요소가 바뀌는 경계에 이름을 붙인다.
        // 기존 tab 키를 그대로 두어 북마크·상세 돌아가기 URL은 바뀌지 않는다.
        { label: '경영 현황', tab: 'dashboard' },
        { label: 'KPI 관리', tab: 'kpi' },
        { label: '조직 관리', tab: 'departments', dividerBefore: '조직·인사' },
        // 직책·직급·호봉 태그는 ADMIN '태그 관리'로 이관했다(2026-08-03) — 쓰기
        // 정책이 is_admin() 하나뿐이라 여기 두면 MANAGEMENT 사용자는 볼 수만 있었다.
        { label: '인사 관리', tab: 'hr' },
        // 근태 원장(정책·상태·일별 기록)의 소유 자리. OFFICE 대시보드 '근무체크'는
        // 본인 기록을 찍기만 하고, 판독·정정은 여기서만 한다.
        { label: '근태 관리', tab: 'attendance' },
        { label: '재무 관리', tab: 'finance', dividerBefore: '재무' },
        // 거래처 원장은 돈이 나가는 상대와 계좌·증빙을 다루므로 재무가 소유한다.
        { label: '거래처 정보', tab: 'partners' },
        // 승인된 결재 문서의 금액을 항목·문서·월로 모은다(양식의 금액 필드가 원천).
        { label: '결재 금액 집계', tab: 'approval-stats' },
        // 지사 원장은 OFFICE 지사 정보와 회의실 예약이 함께 읽는 회사 운영 인프라의 원장이다.
        { label: '지사 관리', tab: 'branches', dividerBefore: '총무·인프라' },
        { label: '자산 관리', tab: 'assets' },
      ],
    },
  ],
}

/**
 * 그룹 목록에서 기본 활성 탭을 반환. 없으면 undefined.
 *
 * 기준은 '첫 항목'이다 — 뒤로 훑어 처음 만나는 tab이 아니다. 첫 항목에 탭이 없다는 것은 그
 * 항목이 워크스페이스 루트 그 자체라는 뜻이므로(원장 목록 워크스페이스·사업 3종) 기본 활성
 * 탭도 없다. 훑어 내려가면 그 아래 있는 다른 메뉴(AC의 '게스트 계정')가 기본값이 되어, 목록
 * 화면에 서 있는데 사이드바는 다른 줄을 활성으로 칠한다.
 */
export function firstTab(groups: SubNavGroup[] | undefined): string | undefined {
  const first = (groups ?? []).flatMap((g) => g.items)[0]
  if (!first) return undefined
  return first.tab ?? first.children?.find((c) => c.tab)?.tab
}

/** 그룹 목록에 존재하는 모든 탭 키 집합(하위 항목 포함). */
export function allTabs(groups: SubNavGroup[] | undefined): Set<string> {
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
