import {
  CAREER_SECTIONS,
  formatRow,
  parseBackground,
  rowParts,
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
            {/* 소제목은 자기가 이끄는 본문(식별값 gray-900)보다 연해지지 않아야 한다 —
                크기 한 단계와 굵기로만 구분하고 색은 본문 최상단과 같이 둔다. */}
            <h3 className="mb-1 text-caption font-semibold text-gray-900">{s.title}</h3>
            <ul className="space-y-0.5">
              {rows.map((r, i) => {
                const [head, ...rest] = rowParts(s, r)
                return (
                  <li key={i} className="flex gap-1.5 text-body">
                    {/* 말머리는 물러나되 글자로 읽혀야 한다 — gray-300은 테두리 단계라
                        글자에 쓰면 인쇄 얼룩처럼 보인다. 글자로 쓰는 가장 연한 단계인 400을 쓴다. */}
                    <span aria-hidden className="shrink-0 select-none text-gray-400">
                      –
                    </span>
                    <span>
                      {/* 식별값(학교·회사·자격증명)만 진하게, 부속 값은 물러난다 —
                          크기는 한 줄 안에서 하나로 두고 색으로만 위계를 만든다. */}
                      <span className="text-gray-900">{head}</span>
                      {rest.length > 0 && (
                        <span className="text-gray-500">{` · ${rest.join(' · ')}`}</span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
