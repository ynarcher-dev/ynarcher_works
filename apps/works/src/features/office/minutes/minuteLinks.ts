import { ENTITIES, type EntityKey } from '@/features/networks/config'
import { GLOBAL_TABLE } from '@/features/networks/globalConfig'

/**
 * 회의록 연동(cross-reference) 대상 메타 — 종류 라벨·원장 테이블·상세 경로의 단일 원천.
 * 편집기 피커·상세 표시·역방향 패널이 모두 이 config를 참조해 종류별 분기를 한곳에 모은다.
 * DB의 다형 키(meeting_minute_links.target_type)와 값이 정확히 일치해야 한다 —
 * 원장: supabase/migrations/20260723220000_meeting_minute_links.sql,
 * NETWORKS 확장: supabase/migrations/20260825150000_network_minute_links.sql
 */

/**
 * NETWORKS 원장 대상 종류(국내 9종 + 글로벌). 전문가·투자사 담당자는 회의의 참석자가 되는
 * 쪽이라 그 사람 상세에서 "낀 회의"를 되짚을 수 있어야 한다.
 * 값은 새로 만들지 않고 자료·코멘트·변동이력이 이미 쓰는 단수 다형 키를 그대로 쓴다
 * (networks/config.ts PROFILE_RESOURCE_TYPE). 은퇴 원장 vendors는 상세 라우트가 없어 제외한다.
 */
export type NetworkMinuteLinkType =
  | 'expert'
  | 'van'
  | 'exp'
  | 'investor'
  | 'corporate'
  | 'institution'
  | 'university'
  | 'etc'
  | 'other'
  | 'global_network'

/** 연동 가능한 대상 종류. 사업 원장의 entityKey(program/ma_program/project_program) + startup + fund + NETWORKS. */
export type MinuteLinkTargetType =
  | 'program'
  | 'ma_program'
  | 'project_program'
  | 'startup'
  | 'fund'
  | NetworkMinuteLinkType

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

/**
 * NETWORKS 원장 1종의 메타 — 라벨·테이블은 원장 정의(ENTITIES)에서 그대로 가져온다.
 * 여기에 라벨을 다시 적으면 원장 이름이 바뀌었을 때 회의록 화면만 옛 이름으로 남는다.
 * 사람·조직 원장이라 부가 표기 자리(사업코드)에는 소속을 넣어 동명이인을 가른다.
 */
const networkTarget = (entity: EntityKey): MinuteLinkTargetMeta => ({
  kindLabel: ENTITIES[entity].label,
  table: ENTITIES[entity].table,
  titleColumn: 'name',
  codeColumn: 'affiliation',
  toPath: (id) => `/networks/${entity}/${id}`,
})

/** 종류 선택 순서(사업 3종 → 스타트업 → 펀드). NETWORKS는 아래 별도 목록. */
export const MINUTE_LINK_TARGET_TYPES: MinuteLinkTargetType[] = [
  'program',
  'ma_program',
  'project_program',
  'startup',
  'fund',
]

/** NETWORKS 종류의 검색·표시 순서(원장 목록 순서와 동일, 미분류·글로벌이 뒤). */
export const NETWORK_MINUTE_LINK_TYPES: NetworkMinuteLinkType[] = [
  'van',
  'exp',
  'expert',
  'investor',
  'corporate',
  'institution',
  'university',
  'etc',
  'other',
  'global_network',
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
  // NETWORKS 국내 원장 — 라우트 세그먼트가 곧 엔티티 키다(router.tsx: networks/:entity/:id).
  van: networkTarget('van'),
  exp: networkTarget('exp'),
  expert: networkTarget('experts'),
  investor: networkTarget('investors'),
  corporate: networkTarget('corporates'),
  institution: networkTarget('institutions'),
  university: networkTarget('universities'),
  etc: networkTarget('etc'),
  other: networkTarget('others'),
  // 글로벌은 독립 마스터라 원장·라우트가 국내 규칙에서 벗어난다(networks/global/:id).
  global_network: {
    kindLabel: '글로벌',
    table: GLOBAL_TABLE,
    titleColumn: 'name',
    codeColumn: 'affiliation',
    toPath: (id) => `/networks/global/${id}`,
  },
}

/**
 * 피커의 '종류' 드롭다운 항목. 사업·스타트업·펀드는 원장 하나가 곧 한 종류지만, 네트워크는
 * 찾는 사람이 어느 원장 소속인지 모른 채 이름부터 떠올린다 — 그래서 10개 원장을 '네트워크'
 * 한 항목으로 묶어 한 번에 검색한다(저장되는 키는 후보 행이 들고 온 원장별 키 그대로).
 */
export interface MinuteLinkPickKind {
  key: string
  label: string
  /** 이 항목이 검색하는 원장 종류(둘 이상이면 한 풀로 합쳐 보여준다). */
  types: MinuteLinkTargetType[]
}

/** 원장 하나가 곧 한 종류인 항목(사업·스타트업·펀드). */
const singleKind = (t: MinuteLinkTargetType): MinuteLinkPickKind => ({
  key: t,
  label: MINUTE_LINK_TARGETS[t].kindLabel,
  types: [t],
})

export const MINUTE_LINK_PICK_KINDS: MinuteLinkPickKind[] = [
  ...MINUTE_LINK_TARGET_TYPES.map(singleKind),
  { key: 'network', label: '네트워크', types: [...NETWORK_MINUTE_LINK_TYPES] },
]

/** 피커 최초 진입 종류(AC 사업). */
export const DEFAULT_MINUTE_LINK_PICK_KIND: MinuteLinkPickKind = singleKind('program')

/** 드롭다운 선택값(key) → 종류. 모르는 값이면 기본 종류로 되돌린다. */
export function minuteLinkPickKind(key: string): MinuteLinkPickKind {
  return MINUTE_LINK_PICK_KINDS.find((k) => k.key === key) ?? DEFAULT_MINUTE_LINK_PICK_KIND
}

/** 회의록에 연동된 대상 1건(표시용). label은 원장 RLS로 접근 가능할 때만 제목이 채워진다. */
export interface MinuteLink {
  targetType: MinuteLinkTargetType
  targetId: string
  /** 대상 제목/이름. 접근 불가(RLS 차단) 대상은 null → UI가 placeholder로 표시. */
  label: string | null
  /** 부가 표기(사업코드·소속 등). 없으면 null. */
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
