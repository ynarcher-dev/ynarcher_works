import type { WorkspaceKey } from '@/auth/types'
import type { SubNavGroup } from '@/config/navigation'
import { MA_BUYER_LIST_LABEL } from '@/features/mna/buyers/config'

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
   * 필요한 곳은 **한 권한 키가 두 자리에 서는 경우** 하나뿐이다 — M&A BUYER가 그렇다.
   * 바이어 원장의 권한은 딜과 같은 `mna`인데(그 원장을 보는 사람과 딜을 보는 사람이 같다)
   * 자리는 갈린다: 딜은 M&A/PE에, 바이어 원장은 DATABASE에 선다. 줄 구성을 키로만 찾으면
   * 두 자리에 같은 줄이 함께 서서, 어느 쪽을 눌러도 같은 곳으로 가는 메뉴가 넷이 된다.
   *
   * 경로도 함께 갈린다(`/mna` vs `/buyers`) — `resolveWorkspace`가 경로로 자리를 판정하므로,
   * 두 구획이 같은 경로를 쓰면 어느 항목에 서 있는지 화면이 답하지 못한다.
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
  /** 스위처에서 워크스페이스가 무엇을 하는지 한 줄로 설명하는 부제. */
  description?: string
  /** 이 항목부터 시작되는 스위처 섹션명. 지정 시 위에 섹션 헤더(구분선+라벨)를 그린다. */
  groupLabel?: string
  /** 섹션 라벨 없이 이 항목 위에 구분선만 그린다. */
  divider?: boolean
}

/** 구획 하나만 덮는 항목의 축약. */
const solo = (key: WorkspaceKey, path: string): WorkspaceSection[] => [{ key, path }]

/**
 * M&A BUYER 한 줄.
 *
 * 위 두 원장과 사이에 선을 긋는다(`dividerBefore`) — DATABASE의 줄들은 원래 선 없이 나란히
 * 서지만(같은 층의 전사 원장이라 선을 그으면 서로 다른 층으로 보인다) 이 줄은 층이 다르다:
 * 스타트업·네트워크는 전사가 함께 쓰는 SSOT이고 바이어는 M&A/PE가 소유하는 업무 원장이라
 * 읽기 권한부터 갈린다. 선이 없으면 네트워크를 볼 수 있는 사람에게 이 줄이 왜 안 보이는지
 * 화면이 답하지 못한다.
 */
const MA_BUYER_SUBNAV: SubNavGroup[] = [
  { items: [{ label: MA_BUYER_LIST_LABEL, dividerBefore: true }] },
]

/**
 * WORKS 앱 스위처 항목 정의(GUEST 제외).
 *
 * 2026-09-07에 BUSINESS 한 항목이 실행 라인 넷으로 다시 갈렸다(2026-09-06 통합 되돌림).
 * 한 자리에 넷을 세우면 스위처가 답하던 '어느 원장인가'를 사이드바 줄 이름이 대신 답해야 하고,
 * 그 대가로 사업 3종이 공유하던 라벨 한 벌을 워크스페이스마다 갈라야 했다. 갈라 세우면 그 답이
 * 스위처로 돌아오고 줄 이름은 다시 한 벌이 된다. DATABASE는 합친 채로 둔다 — 원장들이 오가며
 * 함께 보는 짝이고 줄이 셋뿐이라 이름만으로 구분이 선다.
 *
 * 항목이 여덟이라 구분선은 되살리되 섹션 라벨(`groupLabel`)은 두지 않는다 — 선이 나누는 위쪽
 * 두 블록은 항목이 하나·둘이라 헤더가 항목 이름을 다른 말로 한 번 더 적는 층이 된다.
 */
export const WORKSPACES: WorkspaceNavItem[] = [
  // 업무 허브 — 전사 공통 업무 허브로 최상단에 노출(구 HUB 대시보드·AI 에이전트 통합).
  {
    id: 'office',
    label: 'OFFICE',
    sections: solo('office', '/office'),
    implemented: true,
    description: '전사 공통 업무·대시보드',
  },
  // 데이터베이스 — 쌓아 두고 찾아 보는 원장들이 스위처 항목 하나로 선다(2026-09-06, 2026-09-07 셋).
  //
  // 합친 것은 자리뿐이다 — 원장(`startups`/`networks`)도, 권한 키도, 목록 화면도 갈린 채다.
  // 원장을 합치지 않는 이유는 다형 키 문자열('startups'/'networks')이 명부·기여 로그·자료·
  // 감사 로그에 값으로 저장돼 소유 워크스페이스 판정에 쓰이기 때문이고, 목록을 합치지 않는
  // 이유는 필터 축이 겹치지 않기 때문이다(같은 이름의 '구분'이 두 뜻이고, 한 표에 담으면 열의
  // 절반이 늘 빈다). 합쳐서 얻는 것은 원장을 오갈 때 워크스페이스를 갈아타지 않는 것 하나다.
  //
  // 2026-09-07에 셋이 됐다(M&A BUYER). 항목이 덮는 것은 자리이지 권한이 아니라는 것이 여기서
  // 드러난다 — 세 줄의 읽기 권한 키가 startup·networks·mna로 전부 다르고, 그래서 세 줄이 함께
  // 서는 사람도 있고 한 줄만 서는 사람도 있다.
  {
    id: 'database',
    label: 'DATABASE',
    sections: [
      { key: 'startup', path: '/startup' },
      { key: 'networks', path: '/networks' },
      // M&A BUYER — 인수 희망 주체 원장(2026-09-07). 권한 키는 mna이고 자리만 여기다.
      //
      // 여기 서는 이유는 성격이다 — 딜은 진행하는 일이고 바이어는 **쌓아 두고 찾아 보는 원장**
      // 이라, 스타트업·네트워크와 같은 방식으로 읽힌다(검색해서 열고, 쌓이고, 어느 사업에도
      // 아직 매이지 않는다). 권한을 함께 옮기지는 않는다: 이 원장을 보는 사람은 딜을 보는
      // 사람이고, 키를 startup·networks와 합치면 네트워크 원장을 보라고 준 읽기 권한이
      // 바이어까지 여는 조용한 확대가 된다.
      //
      // 줄 구성을 키가 아니라 구획이 직접 갖는 것도 그래서다(`subnav`) — 같은 mna 키가
      // M&A/PE에도 서 있고, 그쪽 줄은 딜 목록이다.
      { key: 'mna', path: '/buyers', subnav: MA_BUYER_SUBNAV },
    ],
    implemented: true,
    description: '스타트업·네트워크 원장',
  },
  // 실행 라인 — 사업·딜·프로젝트·펀드. 넷이 각각 자기 항목으로 선다(2026-09-07).
  //
  // 순서는 조직 순이다(2026-09-06 사용자 지정) — AC사업 / 글로벌·신사업 / M&A팀·PE / 투자실.
  // 항목명은 원장 이름(영문)으로 두고 조직명은 화면 안쪽 문구가 답한다: 나머지 항목이 전부
  // 영문이라 여기만 한글이면 한 목록 안에서 표기가 섞인다.
  {
    id: 'ac',
    label: 'AC',
    sections: solo('ac', '/ac'),
    implemented: true,
    divider: true,
    description: '액셀러레이팅 사업 관리',
  },
  {
    id: 'project',
    label: 'PROJECT',
    sections: solo('project', '/project'),
    implemented: true,
    description: '수행 프로젝트 관리',
  },
  {
    id: 'mna',
    label: 'M&A/PE',
    sections: solo('mna', '/mna'),
    implemented: true,
    description: '인수·합병·경영참여 딜 관리',
  },
  {
    id: 'fund',
    label: 'FUND',
    sections: solo('fund', '/fund'),
    implemented: true,
    description: '펀드·투자 운용',
  },
  // 경영·시스템 — 백오피스 및 시스템 관리
  {
    id: 'management',
    label: 'MANAGEMENT',
    sections: solo('management', '/management'),
    implemented: true,
    divider: true,
    description: '인사·재무·자산 관리',
  },
  {
    id: 'admin',
    label: 'ADMIN',
    sections: solo('admin', '/admin'),
    implemented: true,
    description: '시스템·권한 관리',
  },
]
