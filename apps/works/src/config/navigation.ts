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
  /** 이 항목 위에 같은 그룹 내 구분선을 그린다(그룹은 유지한 채 항목 사이만 시각적으로 나눌 때). */
  dividerBefore?: boolean
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
 * 사업 3종이 한 라벨을 공유하는 것은 2026-08-20 결정의 연장이다 — 세 워크스페이스는 같은 원장
 * 구조·같은 화면을 쓰므로 메뉴 이름까지 같아야 워크스페이스를 옮겨도 손이 같은 자리를 찾는다.
 * 도메인 명칭(사업·딜)은 목록 안쪽 문구(`entityNoun`)가 계속 답한다.
 *
 * 2026-09-06에 이 라벨을 워크스페이스별 조직명(AC사업 / 글로벌·신사업 / M&A팀·PE / 투자실)으로
 * 갈랐다가 2026-09-07에 되돌렸다 — 가른 것은 실행 라인 넷이 BUSINESS 한 항목 아래 나란히 서서
 * '어느 원장인가'를 줄 이름이 홀로 답해야 했기 때문이고, 스위처가 다시 넷으로 갈리면서 그 답이
 * 항목명으로 돌아왔다. 줄 이름이 그 답을 겸하면 워크스페이스마다 같은 자리의 이름이 달라진다.
 */
export const PROGRAM_LIST_LABEL = '프로젝트'
// 'DB' 꼬리를 되살렸다(2026-09-09 사용자 지정). 2026-09-06에 걷은 근거는 "두 줄이 DATABASE 한
// 항목 아래 나란히 서니 항목명이 이미 그 말을 한다"였는데, 그 뒤 스위처가 갈리면서 각 줄은
// **자기 항목 아래 한 줄**로 서게 됐다 — 대신 말해 주던 항목명이 사라진 것이다. 꼬리가 답하는
// 것은 '이 자리가 무엇을 하는 곳인가'다: 원장을 보는 자리이지 그 대상으로 업무를 하는 화면이
// 아니다(같은 스타트업을 다루는 자리가 프로젝트 명부에도 있다). M&A 두 줄의 이름은 여기가
// 아니라 각자의 원장 설정(MaPartyConfig.listLabel)이 갖는다.
export const NETWORKS_LIST_LABEL = '네트워크 DB'
export const STARTUP_LIST_LABEL = '스타트업 DB'
export const FUND_LIST_LABEL = '운용펀드'
/** 사업·조합별 GUEST 계정 목록의 읽기 전용 창구. */
export const GUEST_ACCOUNT_READ_LABEL = 'GUEST 계정조회'

/**
 * 사업 워크스페이스(AC/M&A/PROJECT) 공용 사이드바 구성 — `프로젝트` 한 줄.
 *
 * 2026-08-03: 사업구분(카테고리)별 세분화 항목을 내렸다. 분류를 메뉴로 두면 그것이
 * '어디에 있는가'가 되어 상태·부서 같은 다른 축과 함께 걸 수 없고(공공 사업 중 진행중만 같은
 * 질문에 답할 수 없다), 분류를 하나 늘릴 때마다 사이드바가 길어진다. 이제 사업구분은 목록의
 * 필터 축 하나이며, 미분류 건은 그 필터의 '미지정' 선택지가 답한다 — 종전에 '기타'가 맡던
 * 사각지대 방어는 `전체 ~`가 이미 구분 무관 전부를 보여주므로 필요 없다.
 */
function programSubnav(options: { guestAccounts?: boolean } = {}): SubNavGroup[] {
  return [
    {
      // 한 줄이다(2026-09-05). 범위(내 프로젝트/전체 프로젝트)는 메뉴가 아니라 목록 상단
      // 토글이 답한다 — 사업구분(2026-08-03)이 먼저 밟은 길과 같은 이유로, 범위를 메뉴로
      // 두면 그것이 '어디에 있는가'가 되어 상태·부서 같은 다른 축과 함께 걸 수 없다.
      items: [
        { label: PROGRAM_LIST_LABEL },
        // 계정생성 — 2026-09-08에 AC 하나에서 **워크스페이스마다 하나**로 늘었다(사용자 지정).
        //
        // 2026-09-07에는 AC에만 세웠고 근거는 "게스트가 실제로 걸려 있는 사업이 전부 AC라
        // 창구를 어디에 둘지의 답이 하나뿐이다"였다. 외부인이 들어오는 자리를 AC·FUND·M&A
        // 셋으로 넓히면서 그 답이 셋이 된다(3_9_2) — 창구는 **자기 원장을 가진 워크스페이스**
        // 것이고, M&A가 세우는 계정의 출처는 ma_sellers·ma_buyers라 AC 창구에 설 수 없다.
        //
        // 이름은 **GUEST 계정조회**다. 사이드바 창구는 사업·조합에 연결된
        // 계정을 조회하고, 실제 계정 생성은 각 프로젝트 상세에서 한다. 제품명은 2026-09-09에
        // 사용자 지정으로 밖에서 부르는 이름이
        // '와이앤아처 포털'에서 GUEST로 되돌아왔다). '발급'을 붙이지 않는 것은 그것이 창구가
        // 하는 일이 아니기 때문이다.
        //
        // **사업 상세의 '와이앤아처 GUEST 설정'과 끝 낱말이 다르다.** 같게 적지 않는 이유는
        // 두 자리가 다른 물음에 답하기 때문이다 — 이 줄은 사업을 가로질러 **발급된 계정과
        // 참여 현황**을 찾는 자리고, 저 버튼은 **이 사업이 밖으로 무엇을 내보내는가**
        // (개요·공지·Q&A·계정)다.
        // 같은 이름을 두 곳에 걸면 어느 쪽을 눌러야 하는지가 이름으로 답해지지 않고, 결국
        // 담당자가 둘 다 열어 봐야 안다.
        //
        // **보는 범위는 두 축으로 좁힌다.** `entityKey`는 참여 사업 칸이 어느 사업을 세는가,
        // `guestMasterTables`는 어느 인격이 목록에 서는가다(그 값이 하위 원장 탭도 편다).
        // 남의 원장 인격이 여기 서면 참여 사업 칸이 비어 있어도 "그 사람 계정이 있다"가
        // 드러난다. 전사 축은 ADMIN '게스트 계정 관리'가 계속 소유한다: 정지·해제는 계정
        // 자체에 걸리는 일이라 원장도 사업도 가려서는 안 된다.
        //
        // 사이드바 맨 아래 고정 영역에 선다(`pinBottom`) — 사업 목록 줄 옆에 나란히 두면
        // 이 워크스페이스의 원장 하나로 읽힌다. 자리를 가르는 것은 `buildNavGroups`이므로
        // `dividerBefore`는 두지 않는다(고정 영역이 이미 자기 경계선을 그어, 함께 쓰면 선이
        // 두 줄 그어진다).
        ...(options.guestAccounts
          ? [{ label: GUEST_ACCOUNT_READ_LABEL, tab: 'guest-accounts', pinBottom: true }]
          : []),
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
      items: [{ label: NETWORKS_LIST_LABEL }],
    },
  ],
  // PROJECT·M&A·FUND 셋 다 창구를 갖는다. 이유는 위 `programSubnav` 주석 — 외부인이
  // 들어오는 자리가 셋이고, 창구는 자기 원장을 가진 워크스페이스의 것이다.
  //
  // FUND가 2026-09-10에 합류했다(사용자 지적 "INVESTMENT에는 사이드바 하단에 안 보여").
  // 종전 주석은 "명부에 해당하는 것이 없어 어디에도 연결할 수 없는 계정만 생긴다"였는데,
  // 2026-09-09에 조합이 게스트 맥락 셋째가 되면서 그 전제가 사라졌다 — **명단은 포트폴리오가
  // 답하고**(`rosterSource.kind = 'table'`), 서버의 `guest_accounts_list`도 그때 조합을
  // 세도록 넓혀 두었다. 창구만 없어서, 조합에 게스트를 연 담당자가 그 계정을 되찾을 자리가
  // 없었다.
  project: programSubnav({ guestAccounts: true }),
  // FUND: 메뉴 한 줄이다(2026-09-05 '내 운용펀드'/'전체 운용펀드' 통합) — 범위는 목록 상단
  // 토글이 답한다. 펀드 종류(AC·VC·PE)는 2026-08-20에 이미 목록의 '구분' 필터로 내려갔다:
  // 분류를 메뉴로 두면 재원·성격·상태와 함께 걸 수 없고(VC 펀드 중 모태 재원만, 같은 질문에
  // 답할 수 없다), 구분이 비어 있는 펀드는 어느 메뉴에도 나타나지 않아 아예 보이지 않았다.
  fund: [
    {
      items: [
        { label: FUND_LIST_LABEL },
        // 이 창구가 발급하는 대상은 포트폴리오사(STARTUP 원장) 하나다 — 근거는 FUND_GUEST_HOST.
        { label: GUEST_ACCOUNT_READ_LABEL, tab: 'guest-accounts', pinBottom: true },
      ],
    },
  ],
  // M&A/PE는 AC와 동일한 사업 원장 구조(features/program)를 공유한다.
  //
  // 이 표가 답하는 것은 딜 목록 한 줄뿐이다. 같은 항목 아래 서는 원장 두 줄(M&A BUYER·
  // SELLER)은 여기 없고 각자의 구획이 직접 갖는다(`WorkspaceSection.subnav`) — 이 표의
  // 열쇠는 권한 키인데 세 구획의 키가 모두 `mna`라, 여기 적으면 세 자리에 같은 줄이 함께
  // 서서 어느 쪽을 눌러도 같은 곳으로 가는 메뉴가 아홉이 된다.
  mna: programSubnav({ guestAccounts: true }),
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
  // OFFICE: 임직원 정보·전사 캘린더 + 게시판(공지사항 고정 + 일반, 아코디언 없이 평탄 나열).
  // 신규 게시판은 모두 이곳에 생성·노출된다.
  office: [
    {
      items: [
        // 전사 원장 조회 블록. 원장은 모두 MANAGEMENT가 갖고 OFFICE는 확인만 한다 —
        // 사람(임직원)·자리(지사)·물건(자산)이 한 블록에 서는 축은 "회사에 무엇이 있나"이며,
        // 자산 현황이 여기 있는 이유도 그것이 빌리는 화면이 아니라 조회면이기 때문이다
        // (2026-09-06 이동 — 종전에는 공간·회의 블록 머리에 있어 예약하는 일로 읽혔다).
        // 임직원 정보 한 메뉴가 조직(목록)과 사람(상세)을 함께 답한다 — 구 '부서 정보'는 여기에 합쳐졌다.
        { label: '임직원 정보', tab: 'managers' },
        { label: '지사 정보', tab: 'branches' },
        { label: '자산 현황', tab: 'outbound' },
        // 거래처 정보는 여기 두지 않는다(2026-09-06) — 원장·등록·조회를 MANAGEMENT '거래처 정보'
        // 한 자리에 모은다. 같은 원장을 두 자리에서 열면 담당자가 어디서 봐야 하는지를 매번
        // 고르게 되고, 조회면은 가린 값 때문에 원장과 다른 답을 하는 화면이 된다.
        // 공간·회의는 사내 자원을 잡아 쓰는 일 한 블록이다. 뒤는 아래 고정 게시판 그룹 경계가 끊는다.
        { label: '회의실 예약', tab: 'rooms', dividerBefore: true },
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
