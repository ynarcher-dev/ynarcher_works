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
  tables: {
    programs: string
    modules: string
    moduleAssignees: string
    managers: string
    departments: string
    participants: string
    timeline: string
    /** 글쓰기 모듈의 글 원장(구 커스텀 활동 원장을 2026-08-03 개명한 것). */
    posts: string
    /** URL첨부 모듈의 링크 원장. */
    links: string
    /**
     * 메뉴별 NOTICE(알림) 원장. 담당자가 모듈 화면 우측에서 쓰고 게스트가 같은 자리에서
     * 읽는 게스트향 기능이라, 게스트 로그인을 개방한 AC만 값을 둔다 — 없으면 화면도
     * NOTICE 칸을 세우지 않는다(읽을 사람이 없는 쓰기 화면을 남기지 않는다).
     */
    notices?: string
    /**
     * 사업개요(사업소개문) 원장 — 사업 1건당 1건. 게스트 로그인 직후 첫 화면에 나가는
     * 소개문이라 게스트 로그인을 개방한 AC만 값을 둔다(NOTICE와 같은 경계) — 없으면
     * 상세의 사업개요 탭도 서지 않는다.
     */
    overviews?: string
  }
  rpcs: {
    setStaffing: string
    setModule: string
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
  /**
   * 연동 DB 명부의 게스트 로그인 개방 운용 여부.
   *
   * AC만 true다 — 게스트 포털이 읽는 원장(program_participants)과 조회 범위 판정이
   * AC 사업을 기준으로 서 있어, M&A·PROJECT 참가자는 명부에 올라도 로그인해서 볼 것이
   * 없다. false면 명부 구성까지만 동작하고 사업 코드·허용·차단 영역은 안내로 대체한다.
   * 눌리지 않는 버튼을 남기면 문의만 늘어나므로 동작 버튼 자체를 노출하지 않는다.
   *
   * 근거: docs/docs_planning/3_4_4_ac_participant_pool.md §12
   */
  guestAccess: boolean
  /** 사업구분 선택지. 빈 배열이면 분류 UI를 감춘다. */
  categories: readonly ProgramCategoryOption[]
  /**
   * 모듈 추가 모달에 노출할 템플릿(module_type) 목록.
   * AC는 전체 11종, M&A·PROJECT는 기본 3종(글쓰기·URL첨부·파일첨부)만 운용한다.
   */
  allowedModuleTypes: readonly string[]
}

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
