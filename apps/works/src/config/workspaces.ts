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
 * 2026-09-07에 BUSINESS 한 항목이 실행 라인 넷으로 다시 갈렸다(2026-09-06 통합 되돌림).
 * 한 자리에 넷을 세우면 스위처가 답하던 '어느 원장인가'를 사이드바 줄 이름이 대신 답해야 하고,
 * 그 대가로 사업 3종이 공유하던 라벨 한 벌을 워크스페이스마다 갈라야 했다. 갈라 세우면 그 답이
 * 스위처로 돌아오고 줄 이름은 다시 한 벌이 된다. Database는 합친 채로 둔다 — 원장들이 오가며
 * 함께 보는 짝이고 줄이 둘뿐이라 이름만으로 구분이 선다.
 *
 * **부제·구분선·섹션 라벨은 두지 않는다(2026-09-07 사용자 지정).** 같은 날 이름이 약어에서
 * 부르는 이름으로 바뀌면서(`Accelerator`·`Investment Office`·`Management Office`) 이름
 * 자체가 그 자리가 무엇인지 답하게 되었고, 부제는 같은 말을 한국어로 한 번 더 적는 층이
 * 되었다. 구분선도 함께 걷는다 — 선은 묶음이 있을 때만 뜻이 서고, 없을 때는 한 목록을 여러
 * 층으로 보이게 만든다. 목록의 순서는 그대로 조직 순이다.
 */
export const WORKSPACES: WorkspaceNavItem[] = [
  // 업무 허브 — 전사 공통 업무 허브로 최상단에 노출(구 HUB 대시보드·AI 에이전트 통합).
  {
    id: 'office',
    label: 'Office',
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
    label: 'Database',
    sections: [
      { key: 'startup', path: '/startup' },
      { key: 'networks', path: '/networks' },
    ],
    implemented: true,
  },
  // 실행 라인 — 사업·딜·펀드. 셋이 각각 자기 항목으로 선다.
  //
  // 순서는 조직 순이다(2026-09-06 사용자 지정) — AC사업 / M&A팀·PE / 투자실.
  // 항목명은 영문으로 둔다: 나머지 항목이 전부 영문이라 여기만 한글이면 표기가 섞인다.
  //
  // 2026-09-07에 세 항목의 이름을 약어에서 **부르는 이름**으로 바꿨다(사용자 지정) —
  // `AC`→`Accelerator`, `FUND`→`Investment Office`, `M&A/PE`→`M&A·PE`. 약어는 안에서
  // 일하는 사람에게만 통하는 말이라, 처음 들어온 사람에게 `AC`와 `FUND`는 무엇을 하는
  // 자리인지 답하지 않는다. 가운뎃점(`·`)은 이 목록의 다른 자리와 같은 구분자다
  // (슬래시는 경로로 읽힌다). **권한 키(`ac`·`fund`·`mna`)는 그대로다** — 그 값은
  // 정책·감사 로그·저장된 설정에 박혀 있고, 바뀐 것은 부르는 이름 하나뿐이다.
  //
  // PROJECT는 2026-09-07에 폐지하고 AC로 합쳤다 — 열린 이래 사업 0건이라 실제로 쓰인 적이
  // 없는데, 줄이 둘이면 프로젝트 성격의 일이 들어올 때마다 어디에 넣을지를 매번 판단해야
  // 하고 두 곳에 나뉘어 쌓인 뒤에는 어느 쪽이 전체인지 답할 근거가 없다. 글로벌·신사업도
  // 이 항목에서 관리한다.
  {
    id: 'ac',
    label: 'Accelerator',
    sections: solo('ac', '/ac'),
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
    label: 'M&A·PE',
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
    label: 'Investment Office',
    sections: solo('fund', '/fund'),
    implemented: true,
  },
  // 경영·시스템 — 백오피스 및 시스템 관리
  {
    id: 'management',
    label: 'Management Office',
    sections: solo('management', '/management'),
    implemented: true,
  },
  {
    id: 'admin',
    label: 'Admin',
    sections: solo('admin', '/admin'),
    implemented: true,
  },
]
