import {
  CAREER_SECTIONS,
  formatRow,
  parseBackground,
  sortRowsByYearDesc,
} from '@/features/networks/careerConfig'

/** 약력 jsonb에 표시할 항목이 하나라도 있는지. */
export function hasCareerRows(raw: unknown): boolean {
  const data = parseBackground(raw)
  return CAREER_SECTIONS.some((s) => (data[s.key] ?? []).some((r) => formatRow(s, r)))
}

interface Props {
  /** `profile.background` 원본 jsonb. */
  value: unknown
}

/**
 * 약력 표시(읽기 전용). 섹션별로 비어있지 않은 항목만 최신 연도 순으로 나열한다.
 * NETWORKS 상세와 임직원 상세가 같은 규격을 쓰도록 이 컴포넌트 하나가 소유한다.
 */
export function CareerView({ value }: Props) {
  const data = parseBackground(value)
  return (
    <div className="space-y-4">
      {CAREER_SECTIONS.map((s) => {
        const rows = sortRowsByYearDesc(s, (data[s.key] ?? []).filter((r) => formatRow(s, r)))
        if (!rows.length) return null
        return (
          <div key={s.key}>
            <h3 className="mb-1 text-caption font-semibold text-gray-700">{s.title}</h3>
            <ul className="space-y-0.5">
              {rows.map((r, i) => (
                <li key={i} className="text-body text-gray-800">
                  {formatRow(s, r)}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
