import type { WorkspaceKey } from '@/auth/types'
import type { SubNavGroup } from '@/config/navigation'
import { MA_BUYER, MA_SELLER } from '@/features/mna/parties/config'

/**
 * 스위처 항목 하나가 덮는 권한 구획.
 *
 * 자리(스위처 항목)와 권한 축(`WorkspaceKey`)은 분리되어 있다 — 항목 하나가 구획 여럿을 덮을
 * 수 있고, 그때도 노출 판정·라우트 게이트·RLS는 여전히 구획마다 자기 키로 한다. 자리를 합치는
 * 것과 권한을 합치는 것은 다른 일이며, 후자는 열려서는 안 된다: STARTUP은 투자기업만 담당자
 * 지정제(`startup_managers`) + 민감정보 마스킹이고 NETWORKS는 영구 공동관리라, 키를 하나로
 * 하면 네트워크 원장을 보라고 준 읽기 권한이 투자기업 상세까지 여는 조용한 확대가 된다.
 */
export interface WorkspaceSection {
  key: WorkspaceKey
  /** 이 구획의 루트 경로. 사이드바 줄과 breadcrumb가 이 값으로 이동한다. */
  path: string
  /**
   * 이 구획의 사이드바 줄 구성. 미지정 시 `WORKSPACE_SUBNAV[key]`가 답한다.
   *
   * 필요한 곳은 **한 권한 키가 한 항목 안에서 여러 줄로 서는 경우**다 — M&A/PE가 그렇다.
   * 딜·BUYER·SELLER 셋이 모두 `mna` 키인데 줄과 화면은 갈린다. 줄 구성을 키로만 찾으면
   * 세 구획에 같은 줄이 함께 서서, 어느 쪽을 눌러도 같은 곳으로 가는 메뉴가 아홉이 된다.
   *
   * **구획의 신원은 키가 아니라 경로다.** `resolveWorkspace`가 경로 앞머리로 구획을
   * 판정하고 활성 줄도 그 경로로 갈리므로, 두 구획이 같은 경로를 쓰거나 한쪽이 다른 쪽의
   * 앞머리이면(`/mna` vs `/mna/buyers`) 어느 줄에 서 있는지 화면이 답하지 못한다.
   */
  subnav?: SubNavGroup[]
}

export interface WorkspaceNavItem {
  /** 스위처 항목 식별자 — 권한 키가 아니다. 구획 하나짜리 항목은 그 키와 같은 값을 쓴다. */
  id: string
  label: string
  /**
   * 이 항목이 덮는 권한 구획. 둘 이상이면 사이드바에 구획마다 한 줄이 선다
   * (읽기 권한이 없는 구획의 줄은 서지 않는다).
   */
  sections: WorkspaceSection[]
  /** 아직 구현되지 않은 워크스페이스는 false (후속 Phase에서 활성화). */
  implemented: boolean
}

/** 구획 하나만 덮는 항목의 축약. */
const solo = (key: WorkspaceKey, path: string): WorkspaceSection[] => [{ key, path }]

/**
 * M&A/PE의 원장 두 줄(BUYER·SELLER).
 *
 * 딜 목록('프로젝트') 아래에 선을 긋고 선다(`dividerBefore`는 첫 줄에만) — 두 줄 사이가
 * 아니라 **딜과 원장 사이**가 층이 갈리는 자리이기 때문이다. 딜은 열리고 닫히는 진행 중인
 * 일이고 BUYER·SELLER는 딜보다 먼저 쌓여 어느 딜로도 이어질 수 있는 원장이라, 선이 없으면
 * 셋이 같은 층의 목록 셋으로 읽힌다. 반대로 두 원장 사이에 선을 하나 더 그으면 사는 쪽과
 * 파는 쪽이 서로 다른 층으로 보인다 — 그 둘은 같은 성격의 짝이다.
 */
const MA_LEDGER_SUBNAV = (label: string, glyphKey: string, first = false): SubNavGroup[] => [
  // 글리프를 줄이 직접 고른다 — 세 구획의 권한 키가 모두 `mna`라 워크스페이스 글리프에
  // 맡기면 딜·BUYER·SELLER가 같은 아이콘 셋으로 선다.
  { items: [{ label, glyphKey, dividerBefore: first }] },
]

/**
 * WORKS 앱 스위처 항목 정의(GUEST 제외).
 *
 * 2026-09-11 메뉴 개편에서 개인 업무의 출발점인 `내 오피스`를 맨 앞에 신설하고, 나머지는
 * 전사 공용 공간 → 데이터 → 조직별 실행 공간 → 시스템 순으로 세웠다. 메뉴를 조직별로 유지하는
 * 이유는 사업부·M&A팀·투자실의 업무 성격이 서로 다르기 때문이다. 부서 간에 배정되는 일은
 * 후속 단계에서 내 오피스가 모으되, 그 일의 원장과 운영 화면은 소유 조직에 남긴다.
 *
 * 명칭은 내부에서 실제로 부르는 한국어 이름으로 통일한다. 부제·구분선·섹션 라벨은 두지 않고,
 * 데이터 센터만 스타트업·네트워크 두 공용 원장을 한 자리에서 오갈 수 있게 유지한다.
 */
export const WORKSPACES: WorkspaceNavItem[] = [
  // 내 오피스 — 기존 OFFICE 대시보드의 개인화 영역을 먼저 연결한다. 별도 권한을 신설하지 않고
  // 전 임직원이 쓰는 office 권한을 공유하며, 후속 기능도 이 독립 경로 아래에 붙인다.
  {
    id: 'my-office',
    label: '내 오피스',
    sections: [
      {
        key: 'office',
        path: '/my-office',
        subnav: [
          {
            items: [
              { label: '대시보드', tab: 'dashboard' },
              { label: '전자결재', tab: 'approval', dividerBefore: true },
            ],
          },
        ],
      },
    ],
    implemented: true,
  },
  // 공용 오피스 — 기존 OFFICE의 전사 공통 업무와 게시 공간을 그대로 유지한다.
  {
    id: 'office',
    label: '공용 오피스',
    sections: solo('office', '/office'),
    implemented: true,
  },
  // 데이터베이스 — 쌓아 두고 찾아 보는 전사 원장 둘이 스위처 항목 하나로 선다(2026-09-06).
  //
  // 합친 것은 자리뿐이다 — 원장(`startups`/`networks`)도, 권한 키도, 목록 화면도 갈린 채다.
  // 원장을 합치지 않는 이유는 다형 키 문자열('startups'/'networks')이 명부·기여 로그·자료·
  // 감사 로그에 값으로 저장돼 소유 워크스페이스 판정에 쓰이기 때문이고, 목록을 합치지 않는
  // 이유는 필터 축이 겹치지 않기 때문이다(같은 이름의 '구분'이 두 뜻이고, 한 표에 담으면 열의
  // 절반이 늘 빈다). 합쳐서 얻는 것은 원장을 오갈 때 워크스페이스를 갈아타지 않는 것 하나다.
  //
  // 2026-09-07에 잠시 셋이었다(M&A BUYER). 되돌린 이유는 **소유**다 — 두 줄은 전사가 함께
  // 쓰는 SSOT이고 BUYER·SELLER는 M&A/PE가 쌓고 M&A/PE만 읽는 업무 원장이라, 여기 세우면
  // 네트워크를 볼 수 있는 사람에게 그 줄이 왜 안 보이는지 화면이 답하지 못한다. 지금 이
  // 항목의 두 줄은 읽기 권한이 갈릴 뿐 대상은 전사 공용이다.
  {
    id: 'database',
    label: '데이터 센터',
    sections: [
      { key: 'startup', path: '/startup' },
      { key: 'networks', path: '/networks' },
    ],
    implemented: true,
  },
  // 실행 라인 — 사업·딜·펀드. 셋이 각각 자기 항목으로 선다.
  //
  // 순서는 조직 순이다 — 사업부 / M&A팀 / 투자실.
  //
  // 2026-09-07에 세 항목의 이름을 약어에서 **부르는 이름**으로 바꿨다(사용자 지정) —
  // `AC`→`Accelerator`, `FUND`→`Investment Office`, `M&A/PE`→`M&A·PE`. 약어는 안에서
  // 일하는 사람에게만 통하는 말이라, 처음 들어온 사람에게 `AC`와 `FUND`는 무엇을 하는
  // 자리인지 답하지 않는다. 가운뎃점(`·`)은 이 목록의 다른 자리와 같은 구분자다
  // (슬래시는 경로로 읽힌다).
  //
  // PROJECT는 2026-09-07에 폐지하고 AC로 합쳤다 — 열린 이래 사업 0건이라 실제로 쓰인 적이
  // 없는데, 줄이 둘이면 프로젝트 성격의 일이 들어올 때마다 어디에 넣을지를 매번 판단해야
  // 하고 두 곳에 나뉘어 쌓인 뒤에는 어느 쪽이 전체인지 답할 근거가 없다.
  //
  // **그리고 2026-09-09에 그 이름이 남은 쪽으로 왔다 — `Accelerator` → `Project`.** 합친
  // 뒤로 이 자리가 담는 것은 액셀러레이팅만이 아니라 신사업·글로벌까지인데, 이름이 담는
  // 것보다 좁으면 그 자리에 무엇을 넣을지를 매번 다시 판단해야 한다(폐지가 없애려던 바로
  // 그 판단이다). **이번에는 권한 키도 함께 바꿨다** — 2026-09-07 개명 때 키를 그대로 둔
  // 근거는 '바뀐 것이 부르는 이름 하나뿐'이어서였는데, 여기서는 뜻이 바뀌었고 무엇보다
  // **DB가 이미 그 이름으로 말하고 있었다**(원장 `programs`, 다형 키 `program`). 어긋나
  // 있던 것은 워크스페이스 키 하나였고, 개명은 그것을 나머지에 맞추는 일이다.
  // 감사 기록은 그대로 둔다 — 그때 그 워크스페이스의 이름은 `ac`였다.
  {
    id: 'project',
    label: '사업부',
    sections: solo('project', '/project'),
    implemented: true,
  },
  // M&A/PE — 딜 한 줄 + 거래상대 원장 두 줄(2026-09-07 이관·신설).
  //
  // 셋 다 권한 키가 `mna`다. 항목이 덮는 것은 자리이고 권한은 구획마다 판정한다는 규칙은
  // 그대로이나, 여기서는 세 구획의 답이 같아 셋이 함께 서거나 함께 빠진다 — 원장을 보는
  // 사람과 딜을 보는 사람이 같기 때문이며, 그래서 이 셋은 한 항목 아래 있는 것이 맞다.
  //
  // 경로는 `/mna` 아래로 넣지 않는다(`/buyers`·`/sellers`). 구획 판정이 경로 앞머리라
  // `/mna/buyers`는 딜 구획에 먼저 걸려, 원장 화면에 서 있는데 사이드바는 딜 줄을 칠한다.
  {
    id: 'mna',
    label: 'M&A팀',
    sections: [
      { key: 'mna', path: '/mna' },
      {
        key: 'mna',
        path: MA_BUYER.basePath,
        subnav: MA_LEDGER_SUBNAV(MA_BUYER.listLabel, 'buy', true),
      },
      { key: 'mna', path: MA_SELLER.basePath, subnav: MA_LEDGER_SUBNAV(MA_SELLER.listLabel, 'sell') },
    ],
    implemented: true,
  },
  {
    id: 'fund',
    label: '투자실',
    sections: solo('fund', '/fund'),
    implemented: true,
  },
  // 경영·시스템 — 백오피스 및 시스템 관리
  {
    id: 'management',
    label: '경영실',
    sections: solo('management', '/management'),
    implemented: true,
  },
  {
    id: 'admin',
    label: '시스템 관리',
    sections: solo('admin', '/admin'),
    implemented: true,
  },
]
