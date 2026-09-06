import type { WorkspaceKey } from '@/auth/types'

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
 * WORKS 앱 스위처 항목 정의(GUEST 제외).
 *
 * 2026-09-06에 구획 헤더·구분선을 걷었다 — STARTUP·NETWORKS가 DATABASE로, 실행 라인 넷이
 * BUSINESS로 합쳐지며 항목이 다섯이 되었고, 그 길이에서 구획을 나누는 선은 무엇을 묶는 것이
 * 아니라 항목 사이를 벌리기만 한다. 무엇을 하는 자리인지는 부제 한 줄이 답한다.
 * (`groupLabel`·`divider`는 필드로 남는다 — 항목이 다시 늘어나는 날 쓴다.)
 */
export const WORKSPACES: WorkspaceNavItem[] = [
  // 업무 허브 — 전사 공통 업무 허브로 최상단에 노출(구 HUB 대시보드·AI 에이전트 통합).
  // 맨 위 한 항목이라 섹션 헤더를 두지 않는다(헤더가 붙는 자리에 항목이 하나뿐이면 그 줄은
  // 항목 이름을 다른 말로 한 번 더 적는 층이 된다).
  {
    id: 'office',
    label: 'OFFICE',
    sections: solo('office', '/office'),
    implemented: true,
    description: '전사 공통 업무·대시보드',
  },
  // 데이터베이스 — 조직의 원장(SSOT) 데이터. 두 원장이 스위처 항목 하나로 선다(2026-09-06).
  //
  // 합친 것은 자리뿐이다 — 원장(`startups`/`networks`)도, 권한 키도, 목록 화면도 갈린 채다.
  // 원장을 합치지 않는 이유는 다형 키 문자열('startups'/'networks')이 명부·기여 로그·자료·
  // 감사 로그에 값으로 저장돼 소유 워크스페이스 판정에 쓰이기 때문이고, 목록을 합치지 않는
  // 이유는 필터 축이 겹치지 않기 때문이다(같은 이름의 '구분'이 두 뜻이고, 한 표에 담으면 열의
  // 절반이 늘 빈다). 합쳐서 얻는 것은 두 원장을 오갈 때 워크스페이스를 갈아타지 않는 것 하나다.
  //
  // 스위처 섹션 라벨('데이터베이스')은 두지 않고 구분선만 긋는다 — 항목 이름이 이미 그 말이라
  // 헤더를 얹으면 같은 말이 두 줄에 선다.
  {
    id: 'database',
    label: 'DATABASE',
    sections: [
      { key: 'startup', path: '/startup' },
      { key: 'networks', path: '/networks' },
    ],
    implemented: true,
    description: '스타트업·네트워크 원장',
  },
  // BUSINESS — 사업·딜·프로젝트·펀드 실행 라인 넷이 스위처 항목 하나로 선다(2026-09-06).
  //
  // DATABASE와 같은 이유이자 같은 방식이다 — 합친 것은 자리뿐이고 권한 키(`ac`/`mna`/
  // `project`/`fund`)·사업 원장 3종·펀드 원장·목록 화면은 갈린 채다. 넷이 한 자리에 서는
  // 근거는 이 워크스페이스들이 서로 다른 원장을 볼 뿐 같은 일(사업을 세우고 굴린다)의
  // 갈래이고, AC·M&A·PROJECT는 이미 화면 구현(`features/program`) 한 벌을 공유한다는 것이다.
  //
  // 대가는 종전에 스위처가 답하던 '어느 원장인가'를 이제 사이드바 줄 이름이 답해야 한다는
  // 것이다 — 그래서 사업 3종이 공유하던 '프로젝트' 한 라벨을 워크스페이스별로 갈랐다
  // (`PROGRAM_LIST_LABELS`). 이름이 같은 줄이 셋이면 무엇을 눌러야 할지 화면이 말하지 못한다.
  {
    id: 'business',
    label: 'BUSINESS',
    // 순서는 조직 순이다(2026-09-06 사용자 지정) — AC사업 / 글로벌·신사업 / M&A팀·PE / 투자실.
    // 사이드바 줄 순서가 곧 이 배열의 순서다.
    sections: [
      { key: 'ac', path: '/ac' },
      { key: 'project', path: '/project' },
      { key: 'mna', path: '/mna' },
      { key: 'fund', path: '/fund' },
    ],
    implemented: true,
    description: '사업·딜·프로젝트·펀드 실행',
  },
  // 경영·시스템 — 백오피스 및 시스템 관리
  {
    id: 'management',
    label: 'MANAGEMENT',
    sections: solo('management', '/management'),
    implemented: true,
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
