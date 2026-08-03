/**
 * 임직원 프로필 '노트' 영역 정의 — 종전 자유 텍스트 한 칸(profile.note)을 세 항목으로 가른다.
 *  · 액셀러레이터 철학 : profile.philosophy (자유 텍스트)
 *  · 관심분야         : profile.interests  (분야 태그명 배열 — ADMIN 분야태그 관리 원장)
 *  · 한마디           : profile.one_liner  (자유 텍스트)
 *
 * 인사 관리 상세·수정과 마이페이지가 같은 키·같은 파서를 쓰도록 정의를 여기 하나에 모은다.
 * 종전 `profile.note`는 지우지 않고 남긴다 — 세 항목으로 옮기기 전까지 상세에서 '이전 기록'으로
 * 노출하고, 편집 화면이 그 글을 철학 칸에 실어 주면(carriedLegacy) 저장 시 원본 키를 비운다.
 */

export interface EmployeeNote {
  philosophy: string
  /** 분야 태그명 배열. 자유 입력이 아니라 태그 원장에서 고른 값만 담긴다. */
  interests: string[]
  oneLiner: string
}

/** 관심분야 태그 원장(ADMIN › 분야태그 관리 — 물리명은 industry_tags). */
export const INTEREST_TAG_TABLE = 'industry_tags'

/** 관심분야 최대 선택 수. 서버(update_my_profile)도 같은 상한으로 막는다. */
export const MAX_INTERESTS = 5

type Profile = Record<string, unknown> | null | undefined

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** profile(jsonb) → 노트 세 항목. 누락 키는 빈 값으로 채운다. */
export function parseNote(profile: Profile): EmployeeNote {
  const p = profile ?? {}
  return {
    philosophy: str(p.philosophy),
    interests: Array.isArray(p.interests)
      ? p.interests.filter((v): v is string => typeof v === 'string')
      : [],
    oneLiner: str(p.one_liner),
  }
}

/** 세 항목이 모두 비었는지 — 이전 기록(note) 이어받기 판정에 쓴다. */
export function isNoteEmpty(note: EmployeeNote): boolean {
  return !note.philosophy.trim() && note.interests.length === 0 && !note.oneLiner.trim()
}

/** 세 항목으로 가르기 전에 쌓인 자유 텍스트 노트. */
export function legacyNote(profile: Profile): string {
  return str((profile ?? {}).note)
}

/**
 * 편집 시작값. 세 항목이 비어 있고 이전 노트만 있으면 그 글을 철학 칸에 실어, 편집자가 화면에서
 * 세 항목으로 갈라 담을 수 있게 한다(carriedLegacy). 이 경우에만 저장 시 원본 note를 비운다 —
 * 임의로 지우면 아직 옮기지 않은 글이 사라진다.
 */
export function noteEditorInit(profile: Profile): {
  value: EmployeeNote
  carriedLegacy: boolean
} {
  const value = parseNote(profile)
  const legacy = legacyNote(profile)
  if (isNoteEmpty(value) && legacy) {
    return { value: { ...value, philosophy: legacy }, carriedLegacy: true }
  }
  return { value, carriedLegacy: false }
}

/** 저장용 profile 병합 값. 빈 값은 null로 지워 쓰지 않는 키가 남지 않게 한다. */
export function noteValues(note: EmployeeNote): Record<string, unknown> {
  return {
    philosophy: note.philosophy.trim() || null,
    interests: note.interests.length ? note.interests : null,
    one_liner: note.oneLiner.trim() || null,
  }
}
