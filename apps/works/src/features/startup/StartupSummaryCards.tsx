import { PanelCard, cardText } from '@ynarcher/ui'
import type { EntityRow } from '@/features/master/entityHooks'

/** 한 축에 담기는 문장 수 상한. 자리 자체가 셋이라 넷째 문장을 쓸 자리가 없다. */
export const SUMMARY_MAX = 3

/**
 * 상세페이지 '요약' 섹션 3축(startups.business_profile 안에 함께 저장).
 *
 * 아래 '기업 개요'(비즈니스·주주·성장·연혁)가 사실을 나열하는 자리라면 여기는 **그 기업이 어떤
 * 기업인지**를 담당자가 문장으로 답하는 자리다. 그래서 축은 값이 아니라 판단이며, 세 축은
 * 각각 지금 잘하는 것 · 지금 부족한 것 · 우리에게 요청하는 것으로 갈린다.
 */
export interface StartupSummary {
  strengths: string[]
  improvements: string[]
  needs: string[]
}

/** jsonb 배열을 문장 배열로 읽는다(빈 문장 제거, 상한 3). */
function readLines(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((s) => (s == null ? '' : String(s).trim()))
    .filter((s) => s !== '')
    .slice(0, SUMMARY_MAX)
}

export function readSummary(record: EntityRow): StartupSummary {
  const o = record.business_profile && typeof record.business_profile === 'object'
    ? (record.business_profile as Record<string, unknown>)
    : {}
  return {
    strengths: readLines(o.strengths),
    improvements: readLines(o.improvements),
    needs: readLines(o.needs),
  }
}

/** 폼 입력값(빈 칸 포함 3줄) → 저장형 배열. 빈 문장은 떨어뜨리고 상한을 다시 강제한다. */
export function toSummaryLines(lines: string[]): string[] {
  return readLines(lines)
}

/** 폼에 세울 3줄 고정 배열(모자란 자리는 빈 칸으로 채운다). */
export function toSummaryInputs(lines: string[]): string[] {
  return Array.from({ length: SUMMARY_MAX }, (_, i) => lines[i] ?? '')
}

/**
 * 요약 축의 색. 이 세 장에만 색을 쓰는 이유는 여기가 값이 아니라 **판단**이기 때문이다 —
 * 아래 카드들이 사실을 나열하는 동안 이 줄만 담당자의 해석이라, 색이 그 성격 차이를 말한다.
 * (색은 상태에만 쓴다는 규칙의 예외이므로 축 이름과 색을 여기 한 곳에 묶어 둔다.)
 * 톤은 임의로 고르지 않고 뜻을 그대로 따른다 — 잘하는 것=success, 살펴야 할 것=warning,
 * 요청받은 것=info. 표면만 옅게(subtle) 두고 테두리는 제목 글자와 같은 값(DEFAULT)을 쓴다 —
 * 테두리와 제목이 다른 농도면 같은 축을 말하는 두 요소가 서로 다른 신호로 읽힌다.
 */
const AXIS_TONES = {
  strengths: {
    card: 'border-success bg-success-subtle',
    title: 'text-success',
    mark: 'text-success',
  },
  improvements: {
    card: 'border-warning bg-warning-subtle',
    title: 'text-warning',
    mark: 'text-warning',
  },
  needs: {
    card: 'border-info bg-info-subtle',
    title: 'text-info',
    mark: 'text-info',
  },
} as const

/**
 * 요약 한 축 카드. 문장은 번호를 매기지 않는다 — 셋은 순위가 아니라 나열이고,
 * 번호를 붙이면 담당자가 쓰지 않은 우선순위를 화면이 만들어 낸다.
 */
function SummaryCard({
  title,
  help,
  items,
  tone,
}: {
  title: string
  help: string
  items: string[]
  tone: (typeof AXIS_TONES)[keyof typeof AXIS_TONES]
}) {
  return (
    <PanelCard
      title={title}
      help={help}
      className={`h-full ${tone.card}`}
      titleClassName={tone.title}
    >
      {items.length === 0 ? (
        <p className={cardText.label}>아직 입력되지 않았습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((s, i) => (
            <li key={i} className={`flex gap-1.5 leading-relaxed ${cardText.value}`}>
              <span aria-hidden className={`select-none ${tone.mark}`}>
                ·
              </span>
              <span className="min-w-0 flex-1">{s}</span>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  )
}

/**
 * 상세페이지 '요약' 섹션 3카드(강점 · 보완점 · 필요사항).
 *
 * 세 축을 세로로 쌓지 않고 한 줄에 나란히 세우는 이유는 비교다 — 강점과 보완점은 같은 기업을
 * 반대편에서 본 서술이라 위아래로 떨어지면 한쪽만 읽힌다. 비어 있는 축도 자리를 지킨다
 * (빈 축이 사라지면 '아직 안 썼다'와 '해당 없다'를 화면이 가르지 못한다).
 */
export function StartupSummaryCards({ summary }: { summary: StartupSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <SummaryCard
        title="강점"
        help="이 기업이 지금 잘하고 있는 것. 최대 3문장으로 적습니다."
        items={summary.strengths}
        tone={AXIS_TONES.strengths}
      />
      <SummaryCard
        title="보완점"
        help="지금 부족하거나 확인이 더 필요한 것. 최대 3문장으로 적습니다."
        items={summary.improvements}
        tone={AXIS_TONES.improvements}
      />
      <SummaryCard
        title="필요사항"
        help="이 기업이 우리에게 요청하거나, 우리가 지원해야 할 것. 최대 3문장으로 적습니다."
        items={summary.needs}
        tone={AXIS_TONES.needs}
      />
    </div>
  )
}
