import type { BadgeTone } from '@ynarcher/ui'
import { createContext, useContext } from 'react'
import type { ProgramCategoryOption } from '@/config/programCategories'

export type { ProgramCategoryOption }

/**
 * 사업(Program) 공용 모듈을 사용하는 워크스페이스 키.
 * AC/M&A/PROJECT는 원장 테이블이 물리적으로 분리되어 있으나 화면·운영 규칙은 동일하므로,
 * 차이를 본 config 하나로 흡수하고 features/program 전체를 공유한다.
 */
export type ProgramWorkspaceKey = 'ac' | 'mna' | 'project'

/**
 * 워크스페이스별 원장 테이블·RPC·분류 정의.
 * 테이블명은 PostgREST 쿼리와 임베드 문자열 조립에 그대로 쓰이므로 실제 물리 테이블명과 일치해야 한다.
 */
export interface ProgramWorkspaceConfig {
  key: ProgramWorkspaceKey
  /**
   * 다형 테이블(entity_contributions.entity_table / entity_feedback.target_type)에서
   * 이 워크스페이스의 사업을 가리키는 값.
   *
   * 세 워크스페이스가 'program' 하나를 공유하던 것을 원장별로 나눴다 — 공유하면 RLS가 값만
   * 보고는 소유 워크스페이스를 판정할 수 없어, M&A·PROJECT 사용자가 자기 사업의 변동 이력과
   * 코멘트를 못 보는 문제가 있었다. 근거: 20260721130000_program_entity_key_split.sql
   *
   * 첨부(attachments)는 정책이 워크스페이스 무관이라 분리하지 않고 'program'을 그대로 쓴다.
   */
  entityKey: 'program' | 'ma_program' | 'project_program'
  /** 라우트 베이스 경로. 목록 `${basePath}`, 상세 `${basePath}/programs/:id`. */
  basePath: string
  /**
   * 목록 안쪽 문구(검색 자리표시자·등록 버튼·업로드 템플릿)에 쓰는 도메인 명칭.
   *
   * 사이드바·페이지 제목은 2026-08-20부터 워크스페이스와 무관하게 `내 프로젝트`/`전체 프로젝트`
   * 한 쌍으로 통일되어 여기서 조립하지 않는다(navigation.ts의 PROGRAM_MINE_LABEL·
   * PROGRAM_ALL_LABEL이 단일 원천) — 워크스페이스별 라벨 필드를 두면 사이드바와 제목이
   * 따로 관리되어 어긋난다.
   */
  entityNoun: string
  /**
   * 워크스페이스별로 갈려 있는 원장만 여기 적는다.
   * 모듈 계열·명부·게스트향 원장은 2026-09-03에 한 벌로 통합되어 `SHARED_TABLES`가 소유하며,
   * 그 행의 소속은 테이블 이름이 아니라 `entity_key`가 답한다. 같은 이름을 세 config에
   * 세 번 적으면 "갈릴 수 있는 값"으로 읽혀, 실제로는 하나인 원장을 갈라 놓으려는 시도가 는다.
   */
  tables: {
    programs: string
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
}

/**
 * 세 워크스페이스가 공유하는 통합 원장(2026-09-03).
 *
 * 종전에는 모듈·배정·글·링크·명부가 워크스페이스마다 한 벌씩 있었고, 그 결과 정형 운영 모듈
 * 8종의 내용물 원장 30여 종이 전부 AC 모듈 원장에 FK로 매여 M&A·PROJECT에서는 모듈을 만들어도
 * 안을 채울 수 없었다. 원장을 한 벌로 합치고 **행마다 `entity_key`가 소속을 답하게** 하면서,
 * 그 위에 올라가는 기능은 워크스페이스를 가리지 않게 되었다.
 *
 * 그래서 화면이 지켜야 할 규칙이 하나 생긴다 — **사업으로 좁히지 않는 조회에는 반드시
 * `entity_key`를 함께 건다.** 사업 id로 좁히는 조회는 id 자체가 한 원장에만 있으므로 안전하지만,
 * (스타트업 참여 이력처럼) 사업을 가로지르는 조회는 세 워크스페이스의 행을 한꺼번에 집어 온다.
 */
export const SHARED_TABLES = {
  modules: 'program_modules',
  moduleAssignees: 'program_module_assignees',
  participants: 'program_participants',
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
  /** 사업 QNA(게스트 질문 + 담당자 답변, 1:1 문의함). */
  questions: 'program_questions',
} as const

const ProgramWorkspaceContext = createContext<ProgramWorkspaceConfig | null>(null)

export const ProgramWorkspaceProvider = ProgramWorkspaceContext.Provider

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
