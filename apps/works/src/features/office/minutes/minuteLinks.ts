import { NETWORK_TABLE, NETWORK_TARGET_TYPE } from '@/features/networks/config'

/**
 * 회의록 연동(cross-reference) 대상 메타 — 종류 라벨·원장 테이블·상세 경로의 단일 원천.
 * 편집기 피커·상세 표시·역방향 패널이 모두 이 config를 참조해 종류별 분기를 한곳에 모은다.
 * DB의 다형 키(meeting_minute_links.target_type)와 값이 정확히 일치해야 한다 —
 * 원장: supabase/migrations/20260723220000_meeting_minute_links.sql,
 * NETWORKS 확장: supabase/migrations/20260825150000_network_minute_links.sql
 */

/**
 * NETWORKS 원장 대상 종류. 원장이 하나로 합쳐지면서(2026-09-04) 종류도 하나다 —
 * 종전에는 구분마다 원장이 있어 키가 10개였다(expert·van·investor…).
 * 값은 자료·코멘트·변동이력이 함께 쓰는 단수 다형 키 그대로다(networks/config.ts).
 */
export type NetworkMinuteLinkType = typeof NETWORK_TARGET_TYPE

/** 연동 가능한 대상 종류. 사업 원장의 entityKey(program/ma_program/project_program) + startup + fund + NETWORKS. */
export type MinuteLinkTargetType =
  | 'program'
  | 'ma_program'
  | 'project_program'
  | 'startup'
  | 'fund'
  | NetworkMinuteLinkType

/**
 * 회의록이 그 대상을 가리키는 **이유**. 대상을 가리킨다는 사실 자체는 종류와 무관하게 같은
 * 모양이라 원장도 하나(`meeting_minute_links`)이고, 갈리는 것은 이유 하나뿐이다.
 * DB: `meeting_minute_links.role`(20260903240000).
 */
export type MinuteLinkRole = 'SUBJECT' | 'EXTERNAL_ATTENDEE'

export interface MinuteLinkTargetMeta {
  /** 종류 선택 UI에 노출하는 라벨. */
  kindLabel: string
  /** 검색 원장 테이블(PostgREST from). RLS로 접근 가능한 행만 돌아온다. */
  table: string
  /** 제목/이름 컬럼(검색·표시 공용). */
  titleColumn: string
  /** 부가 표기 컬럼(사업코드·소속 등). 없으면 null. */
  codeColumn: string | null
  /** 상세 페이지 경로 조립기. */
  toPath: (id: string) => string
}

/** 종류 선택 순서(사업 3종 → 스타트업 → 펀드 → 네트워크). */
export const MINUTE_LINK_TARGET_TYPES: MinuteLinkTargetType[] = [
  'program',
  'ma_program',
  'project_program',
  'startup',
  'fund',
  'network',
]

/** 외부 참석자로 걸 수 있는 종류 — 회의에 오는 것은 사람이고 사람은 네트워크 원장에 있다. */
export const NETWORK_MINUTE_LINK_TYPES: NetworkMinuteLinkType[] = ['network']

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
  // NETWORKS — 원장이 하나이므로 종류도 하나이고 상세 경로도 하나다.
  network: {
    kindLabel: '네트워크',
    table: NETWORK_TABLE,
    titleColumn: 'name',
    // 사람·조직 원장이라 부가 표기 자리에는 소속을 넣어 동명이인을 가른다.
    codeColumn: 'affiliation',
    toPath: (id) => `/networks/record/${id}`,
  },
}

/**
 * 피커의 '종류' 드롭다운 항목. 원장 하나가 곧 한 종류다 — 종전에는 네트워크만 원장 10개를
 * 한 항목으로 묶었는데(찾는 사람이 어느 원장 소속인지 모른 채 이름부터 떠올리므로),
 * 원장 통합으로 그 묶음이 필요 없어졌다.
 */
export interface MinuteLinkPickKind {
  key: string
  label: string
  /** 이 항목이 검색하는 원장 종류. */
  types: MinuteLinkTargetType[]
}

export const MINUTE_LINK_PICK_KINDS: MinuteLinkPickKind[] = MINUTE_LINK_TARGET_TYPES.map((t) => ({
  key: t,
  label: MINUTE_LINK_TARGETS[t].kindLabel,
  types: [t],
}))

/** 피커 최초 진입 종류(AC 사업). */
export const DEFAULT_MINUTE_LINK_PICK_KIND: MinuteLinkPickKind = MINUTE_LINK_PICK_KINDS[0]!

/** 드롭다운 선택값(key) → 종류. 모르는 값이면 기본 종류로 되돌린다. */
export function minuteLinkPickKind(key: string): MinuteLinkPickKind {
  return MINUTE_LINK_PICK_KINDS.find((k) => k.key === key) ?? DEFAULT_MINUTE_LINK_PICK_KIND
}

/** 회의록에 연동된 대상 1건(표시용). label은 원장 RLS로 접근 가능할 때만 제목이 채워진다. */
export interface MinuteLink {
  targetType: MinuteLinkTargetType
  targetId: string
  /** 가리키는 이유. 화면은 이 값으로 '연동'과 '외부 참석자'를 갈라 놓는다. */
  role?: MinuteLinkRole
  /** 대상 제목/이름. 접근 불가(RLS 차단) 대상은 null → UI가 placeholder로 표시. */
  label: string | null
  /** 부가 표기(사업코드·소속 등). 없으면 null. */
  code?: string | null
}

/** 저장 payload용 최소 링크(종류+id+역할). 역할을 생략하면 서버가 `SUBJECT`로 읽는다. */
export interface MinuteLinkRef {
  targetType: MinuteLinkTargetType
  targetId: string
  role?: MinuteLinkRole
}

/** 종류 라벨 조회(미등록 종류는 원본 문자열 그대로). */
export function minuteLinkKindLabel(type: string): string {
  return MINUTE_LINK_TARGETS[type as MinuteLinkTargetType]?.kindLabel ?? type
}

/** 상세 경로 조립(미등록 종류는 null → 링크 비활성화). */
export function minuteLinkPath(type: string, id: string): string | null {
  return MINUTE_LINK_TARGETS[type as MinuteLinkTargetType]?.toPath(id) ?? null
}
