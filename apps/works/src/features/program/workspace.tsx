import type { BadgeTone } from '@ynarcher/ui'
import { createContext, useContext, type ReactNode } from 'react'
import type { ProgramCategoryOption } from '@/config/programCategories'
import { GuestHostProvider, type GuestHostConfig } from '@/features/guest/host'

export type { ProgramCategoryOption }

/**
 * 사업(Program) 공용 모듈을 사용하는 워크스페이스 키.
 * AC/M&A는 사업 본체 원장이 물리적으로 분리되어 있으나 화면·운영 규칙은 동일하므로,
 * 차이를 본 config 하나로 흡수하고 features/program 전체를 공유한다.
 *
 * 2026-09-07까지는 셋이었다(PROJECT 포함). PROJECT는 열린 이래 사업 0건이라 폐지하고
 * AC로 합쳤다 — 이 축에 값을 하나 더 두는 비용은 config 한 벌이 아니라, 사업이 들어올
 * 때마다 어디에 넣을지 판단하는 일과 사업을 가로지르는 조회가 하나 더 붙는 일이다.
 */
export type ProgramWorkspaceKey = 'project' | 'mna'

/**
 * 워크스페이스별 원장 테이블·RPC·분류 정의.
 * 테이블명은 PostgREST 쿼리와 임베드 문자열 조립에 그대로 쓰이므로 실제 물리 테이블명과 일치해야 한다.
 */
export interface ProgramWorkspaceConfig extends GuestHostConfig {
  key: ProgramWorkspaceKey
  /**
   * 다형 테이블(entity_contributions.entity_table / entity_feedback.target_type)에서
   * 이 워크스페이스의 사업을 가리키는 값.
   *
   * 워크스페이스들이 'program' 하나를 공유하던 것을 원장별로 나눴다 — 공유하면 RLS가 값만
   * 보고는 소유 워크스페이스를 판정할 수 없어, M&A 사용자가 자기 사업의 변동 이력과
   * 코멘트를 못 보는 문제가 있었다. 근거: 20260721130000_program_entity_key_split.sql
   *
   * 첨부(attachments)는 정책이 워크스페이스 무관이라 분리하지 않고 'program'을 그대로 쓴다.
   */
  entityKey: 'program' | 'ma_program'
  /** 목록·업로드의 베이스 경로(목록 `${basePath}`, 업로드 `${basePath}/bulk`). */
  basePath: string
  /**
   * 상세 경로의 앞부분(`${detailBase}/:id`).
   *
   * `basePath`에서 규칙으로 만들지 않고 값으로 받는다 — 상세 경로의 모양이 구획마다
   * 다르기 때문이다(2026-09-09 정리): 구획에 원장이 하나면 이름을 생략하고(`/project/:id`),
   * 여럿이면 원장 이름을 단다(`/mna/deals/:id` — 딜·BUYER·SELLER 셋이 산다). 어느 쪽인지는
   * 그 구획만 아는 사실이라, 공용 화면이 규칙으로 조립하면 한쪽이 반드시 틀린다.
   */
  detailBase: string
  /** 사이드바·breadcrumb·페이지 제목에 쓰는 목록 화면 이름. */
  listLabel: string
  /**
   * 목록 안쪽 문구(검색 자리표시자·등록 버튼·업로드 템플릿)에 쓰는 도메인 명칭.
   *
   * 사이드바·breadcrumb·페이지 제목은 `listLabel`이 답하고, 이 값은 그 안에서 관리하는
   * 한 건을 무엇이라 부르는지 답한다. 예: 사업부는 listLabel=`관리 사업`, entityNoun=`사업`.
   */
  entityNoun: string
  /**
   * 워크스페이스별로 갈려 있는 원장만 여기 적는다.
   * 모듈 계열·명부·게스트향 원장은 2026-09-03에 한 벌로 통합되어 `SHARED_TABLES`가 소유하며,
   * 그 행의 소속은 테이블 이름이 아니라 `entity_key`가 답한다. 같은 이름을 워크스페이스마다
   * 다시 적으면 "갈릴 수 있는 값"으로 읽혀, 실제로는 하나인 원장을 갈라 놓으려는 시도가 는다.
   */
  tables: {
    programs: 'programs' | 'ma_programs'
    managers: string
    departments: string
    timeline: string
  }
  rpcs: {
    setStaffing: string
  }
  /**
   * 제안 단계(시도·선정·미선정) 운용 여부. false면 상태 수명주기가 운영 4단계
   * (준비→진행중→종료/취소)만으로 좁혀지고 등록 폼의 단계 라디오·제안 블록이 사라진다.
   *
   * AC만 true다 — 공고에 제안해 선정되어야 사업이 열리므로 '선정되지 않은 사업'이 원장에
   * 남아야 한다. M&A·PROJECT는 착수 결정이 곧 시작이라 제안 단계를 밟지 않는다.
   * 값 자체의 저장은 DB CHECK 제약(20260803120000)이 함께 막는다 — 화면에서 숨기는 것은
   * 보안이 아니다.
   */
  hasProposalStage: boolean
  /** M&A에서만 운용하는 중단(SUSPENDED) 상태. 취소와 저장 의미는 갈리지만 현황에서는 함께 센다. */
  hasSuspendedStatus?: boolean
  /**
   * 주관(host_organization — 이 사업을 발주·주관하는 기관/기업) 운용 여부.
   * false면 목록 열·등록 폼 칸·상세 항목·업로드 열이 함께 사라진다.
   *
   * AC만 true다 — 공고를 낸 주관기관이 있어야 제안이 성립하므로 "누가 준 사업인가"가
   * 사업을 가르는 축이 된다. M&A·PROJECT는 우리가 스스로 여는 일이라 물을 대상이 없고,
   * 빈 열을 남겨 두면 목록에서 영원히 '-'만 찬 칸이 폭을 먹는다.
   * 컬럼 자체는 세 원장에 모두 있으므로(20260705150100 / 20260720140000 / 20260720150000)
   * 조회 select는 갈라지지 않고, 이 플래그는 화면과 저장 페이로드만 가른다.
   */
  hasHostOrganization: boolean
  /** 사업구분 선택지. 빈 배열이면 분류 UI를 감춘다. */
  categories: readonly ProgramCategoryOption[]
  /**
   * 분류 칸의 이름(등록 폼 라벨·목록 필터 칩).
   *
   * `entityNoun`에서 조립하지 않는 이유는 두 낱말이 붙는 방식이 워크스페이스마다 다르기
   * 때문이다 — AC는 '사업구분'이 한 낱말이고 M&A는 '프로젝트 구분'으로 띄어 쓴다. 규칙으로
   * 짓지 못하는 말은 규칙인 척하지 않고 값으로 든다(MaPartyConfig의 `fundsLabel`과 같은 처리).
   */
  categoryNoun: string
  /*
   * `overviewNoun`·`rosterLabel`·`guestMasterTables`·`rosterSource`는 `GuestHostConfig`가
   * 소유한다(2026-09-09). 그 넷은 사업 워크스페이스만의 값이 아니라 **게스트에게 무엇이
   * 나가는가**를 다루는 화면들이 함께 읽는 값이고, 조합(FUND)도 같은 화면을 세우기 때문이다.
   *
   * M&A의 `rosterLabel`이 '딜 참여사'인 이유는 층이 아니라 뜻이다 — 인수후보사는 이 딜에
   * *참가한* 것이 아니라 *검토하는* 쪽이고, 그 관계를 부르는 말은 이 워크스페이스가
   * URL·메뉴에서 이미 쓰는 낱말(딜)에 매달아야 한다.
   */
}

/**
 * 사업 워크스페이스들이 공유하는 통합 원장(2026-09-03).
 *
 * 종전에는 모듈·배정·글·링크·명부가 워크스페이스마다 한 벌씩 있었고, 그 결과 정형 운영 모듈
 * 8종의 내용물 원장 30여 종이 전부 AC 모듈 원장에 FK로 매여 M&A에서는 모듈을 만들어도
 * 안을 채울 수 없었다. 원장을 한 벌로 합치고 **행마다 `entity_key`가 소속을 답하게** 하면서,
 * 그 위에 올라가는 기능은 워크스페이스를 가리지 않게 되었다.
 *
 * 그래서 화면이 지켜야 할 규칙이 하나 생긴다 — **사업으로 좁히지 않는 조회에는 반드시
 * `entity_key`를 함께 건다.** 사업 id로 좁히는 조회는 id 자체가 한 원장에만 있으므로 안전하지만,
 * (스타트업 참여 이력처럼) 사업을 가로지르는 조회는 모든 워크스페이스의 행을 한꺼번에 집어 온다.
 */
export const SHARED_TABLES = {
  modules: 'program_modules',
  moduleAssignees: 'program_module_assignees',
  participants: 'program_participants',
  /**
   * 참가자 목록(명단) — 참가 사실 한 축만 지는 원장이며 위 `participants`(게스트 문·계정 축)와
   * 갈려 있다. 가른 이유는 담는 순간 "게스트 계정이 있다"가 함께 서던 것을 떼기 위해서다.
   * 계정은 다음 라운드에서 이 명단을 보고 **골라서** 만든다(자동 생성이 아니다).
   */
  participantEntries: 'program_participant_entries',
  /** 글쓰기 모듈의 글 원장(구 커스텀 활동 원장을 2026-08-03 개명한 것). */
  posts: 'program_posts',
  /** URL첨부 모듈의 링크 원장. */
  links: 'program_links',
  /** 메뉴별 NOTICE(알림) — 모듈에 매달리므로 소속은 모듈이 답한다. */
  notices: 'program_notices',
  /** 사업개요(사업소개문) — 사업 1건당 1건. */
  overviews: 'program_overviews',
  /** 사업 공지사항(사업 단위 게시판 — 모듈별 NOTICE와 축이 다르다). */
  announcements: 'program_announcements',
  /** 사업 Q&A(게스트 질문 + 담당자 답변, 1:1 문의함). */
  questions: 'program_questions',
} as const

const ProgramWorkspaceContext = createContext<ProgramWorkspaceConfig | null>(null)

/**
 * 사업 워크스페이스 설정을 내려 준다. **게스트 맥락 설정도 같은 값으로 함께 내려간다** —
 * `ProgramWorkspaceConfig`가 `GuestHostConfig`를 상속하므로 사업 워크스페이스는 게스트 맥락
 * 하나이기도 하다.
 *
 * 두 Provider를 화면마다 나란히 쓰게 하지 않는 이유는 하나를 빠뜨릴 수 있어서다 — 그때
 * 나오는 것은 오류가 아니라 개요·공지 탭에서만 터지는 예외라, 그 자리를 열어 보기 전에는
 * 드러나지 않는다. 조합(FUND)은 사업 설정이 없으므로 `GuestHostProvider`를 직접 쓴다.
 */
export function ProgramWorkspaceProvider({
  value,
  children,
}: {
  value: ProgramWorkspaceConfig
  children: ReactNode
}) {
  return (
    <ProgramWorkspaceContext.Provider value={value}>
      <GuestHostProvider value={value}>{children}</GuestHostProvider>
    </ProgramWorkspaceContext.Provider>
  )
}

/**
 * 현재 화면이 속한 사업 워크스페이스 설정을 반환한다.
 * Provider 밖에서 호출하면 잘못된 원장에 질의할 위험이 있으므로 즉시 예외를 던진다.
 */
export function useProgramWorkspace(): ProgramWorkspaceConfig {
  const ctx = useContext(ProgramWorkspaceContext)
  if (!ctx) {
    throw new Error('useProgramWorkspace는 ProgramWorkspaceProvider 내부에서만 사용할 수 있습니다.')
  }
  return ctx
}

/** 사업구분 값 → 라벨. 미지정/미등록 값은 null. */
export function categoryLabel(config: ProgramWorkspaceConfig, value: string | null): string | null {
  if (!value) return null
  return config.categories.find((c) => c.value === value)?.label ?? null
}

/** 사업구분 값 → 배지 톤. 미등록 값은 중립. */
export function categoryTone(config: ProgramWorkspaceConfig, value: string | null): BadgeTone {
  if (!value) return 'neutral'
  return config.categories.find((c) => c.value === value)?.tone ?? 'neutral'
}
