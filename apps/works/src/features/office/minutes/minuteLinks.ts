/**
 * 회의록 연동(cross-reference) 대상 메타 — 종류 라벨·원장 테이블·상세 경로의 단일 원천.
 * 편집기 피커·상세 표시·역방향 패널이 모두 이 config를 참조해 종류별 분기를 한곳에 모은다.
 * DB의 다형 키(meeting_minute_links.target_type)와 값이 정확히 일치해야 한다 —
 * 원장: supabase/migrations/20260723220000_meeting_minute_links.sql
 */

/** 연동 가능한 대상 종류. 사업 원장의 entityKey(program/ma_program/project_program) + startup + fund. */
export type MinuteLinkTargetType = 'program' | 'ma_program' | 'project_program' | 'startup' | 'fund'

export interface MinuteLinkTargetMeta {
  /** 종류 선택 UI에 노출하는 라벨. */
  kindLabel: string
  /** 검색 원장 테이블(PostgREST from). RLS로 접근 가능한 행만 돌아온다. */
  table: string
  /** 제목/이름 컬럼(검색·표시 공용). */
  titleColumn: string
  /** 부가 표기 컬럼(사업코드 등). 없으면 null. */
  codeColumn: string | null
  /** 상세 페이지 경로 조립기. */
  toPath: (id: string) => string
}

/** 종류 선택 세그먼트·검색 순서(사업 3종 → 스타트업 → 펀드). */
export const MINUTE_LINK_TARGET_TYPES: MinuteLinkTargetType[] = [
  'program',
  'ma_program',
  'project_program',
  'startup',
  'fund',
]

export const MINUTE_LINK_TARGETS: Record<MinuteLinkTargetType, MinuteLinkTargetMeta> = {
  program: {
    kindLabel: 'AC 사업',
    table: 'programs',
    titleColumn: 'title',
    codeColumn: 'code',
    toPath: (id) => `/ac/programs/${id}`,
  },
  ma_program: {
    kindLabel: 'M&A 딜',
    table: 'ma_programs',
    titleColumn: 'title',
    codeColumn: 'code',
    toPath: (id) => `/mna/programs/${id}`,
  },
  project_program: {
    kindLabel: 'PROJECT',
    table: 'project_programs',
    titleColumn: 'title',
    codeColumn: 'code',
    toPath: (id) => `/project/programs/${id}`,
  },
  startup: {
    kindLabel: 'STARTUP',
    table: 'startups',
    titleColumn: 'name',
    codeColumn: null,
    toPath: (id) => `/startup/discovered/${id}`,
  },
  fund: {
    kindLabel: 'FUND',
    table: 'funds',
    titleColumn: 'name',
    codeColumn: null,
    toPath: (id) => `/fund/${id}`,
  },
}

/** 회의록에 연동된 대상 1건(표시용). label은 원장 RLS로 접근 가능할 때만 제목이 채워진다. */
export interface MinuteLink {
  targetType: MinuteLinkTargetType
  targetId: string
  /** 대상 제목/이름. 접근 불가(RLS 차단) 대상은 null → UI가 placeholder로 표시. */
  label: string | null
  /** 부가 표기(사업코드 등). 없으면 null. */
  code?: string | null
}

/** 저장 payload용 최소 링크(종류+id). */
export interface MinuteLinkRef {
  targetType: MinuteLinkTargetType
  targetId: string
}

/** 종류 라벨 조회(미등록 종류는 원본 문자열 그대로). */
export function minuteLinkKindLabel(type: string): string {
  return MINUTE_LINK_TARGETS[type as MinuteLinkTargetType]?.kindLabel ?? type
}

/** 상세 경로 조립(미등록 종류는 null → 링크 비활성화). */
export function minuteLinkPath(type: string, id: string): string | null {
  return MINUTE_LINK_TARGETS[type as MinuteLinkTargetType]?.toPath(id) ?? null
}
