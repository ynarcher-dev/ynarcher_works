/** 약력 세부 섹션 정의(학력/경력/자격증/수상). 편집기·표시 공용 원천. */

export interface CareerField {
  key: string
  placeholder: string
}

export interface CareerSection {
  key: string
  title: string
  fields: CareerField[]
}

/** 섹션 한 항목(필드키 → 값). */
export type CareerRow = Record<string, string>
/** 섹션키 → 항목 배열. */
export type CareerData = Record<string, CareerRow[]>

export const CAREER_SECTIONS: CareerSection[] = [
  {
    key: 'education',
    title: '학력',
    fields: [
      { key: 'school', placeholder: '학교' },
      { key: 'major', placeholder: '전공' },
      { key: 'degree', placeholder: '학위' },
      { key: 'period', placeholder: '기간 (예: 2010-2014)' },
    ],
  },
  {
    key: 'career',
    title: '경력',
    fields: [
      { key: 'org', placeholder: '회사/기관' },
      { key: 'position', placeholder: '직책' },
      { key: 'period', placeholder: '기간 (예: 2015-2020)' },
    ],
  },
  {
    key: 'certifications',
    title: '자격증',
    fields: [
      { key: 'name', placeholder: '자격증명' },
      { key: 'issuer', placeholder: '발급기관' },
      { key: 'date', placeholder: '취득일 (예: 2018)' },
    ],
  },
  {
    key: 'awards',
    title: '수상',
    fields: [
      { key: 'name', placeholder: '수상명' },
      { key: 'org', placeholder: '수여기관' },
      { key: 'year', placeholder: '수상연도 (예: 2021)' },
    ],
  },
]

/** 섹션의 빈 항목 생성. */
export function emptyRow(section: CareerSection): CareerRow {
  return Object.fromEntries(section.fields.map((f) => [f.key, '']))
}

/** jsonb 원본을 섹션별 항목 배열로 정규화(누락 섹션은 빈 배열). */
export function parseBackground(raw: unknown): CareerData {
  const obj = (raw ?? {}) as Record<string, unknown>
  const out: CareerData = {}
  for (const s of CAREER_SECTIONS) {
    out[s.key] = Array.isArray(obj[s.key]) ? (obj[s.key] as CareerRow[]) : []
  }
  return out
}

/** 표시용: 항목의 비어있지 않은 필드를 ' · '로 결합. */
export function formatRow(section: CareerSection, row: CareerRow): string {
  return section.fields
    .map((f) => row[f.key]?.trim())
    .filter(Boolean)
    .join(' · ')
}

/**
 * 항목의 대표 연도(정렬 기준). 각 섹션의 마지막 필드(기간/취득일/수상연도)에서
 * 최대 4자리 연도를 추출한다. 범위값("2015-2020")은 끝 연도, 연도 없음은 최하단(-Infinity).
 */
export function rowYear(section: CareerSection, row: CareerRow): number {
  const last = section.fields[section.fields.length - 1]
  const years = (last ? (row[last.key] ?? '') : '').match(/\d{4}/g)
  return years ? Math.max(...years.map(Number)) : -Infinity
}

/** 항목을 최신 연도가 위로 오도록 내림차순 정렬한 새 배열을 반환한다(원본 불변). */
export function sortRowsByYearDesc(
  section: CareerSection,
  rows: CareerRow[],
): CareerRow[] {
  return [...rows].sort((a, b) => rowYear(section, b) - rowYear(section, a))
}
