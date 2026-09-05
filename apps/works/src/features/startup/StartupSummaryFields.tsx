import { Input, Tooltip, formText, tooltipScale } from '@ynarcher/ui'
import { toSummaryInputs, type StartupSummary } from '@/features/startup/StartupSummaryCards'

interface Props {
  summary: StartupSummary
  setSummary: (s: StartupSummary) => void
}

/** 한 축 입력(문장 3줄 고정). 축의 뜻은 라벨 옆 말풍선으로 접는다. */
function AxisFields({
  label,
  help,
  lines,
  onChange,
}: {
  label: string
  help: string
  lines: string[]
  onChange: (lines: string[]) => void
}) {
  const rows = toSummaryInputs(lines)
  return (
    <div>
      <p className={`mb-1 ${formText.label}`}>
        {label}
        <Tooltip label={label} content={help} className={tooltipScale.gap} />
      </p>
      <div className="space-y-2">
        {rows.map((v, i) => (
          <Input
            key={i}
            value={v}
            placeholder={`${i + 1}번째 문장`}
            onChange={(e) => onChange(rows.map((r, j) => (j === i ? e.target.value : r)))}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * 통합 수정 폼의 '기업 요약' 입력 섹션(강점 · 보완점 · 필요사항).
 *
 * 상한(3문장)은 글자 수 검증이 아니라 **자리 수**로 강제한다 — 넷째 문장을 쓸 칸이 없으면
 * 넘칠 일도, 넘쳤다고 알릴 오류 문구도 필요 없다. 빈 줄은 저장 시 떨어진다.
 */
export function StartupSummaryFields({ summary, setSummary }: Props) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
      <AxisFields
        label="강점"
        help="이 기업이 지금 잘하고 있는 것을 최대 3문장으로 적습니다. 빈 줄은 저장되지 않습니다."
        lines={summary.strengths}
        onChange={(strengths) => setSummary({ ...summary, strengths })}
      />
      <AxisFields
        label="보완점"
        help="지금 부족하거나 확인이 더 필요한 것을 최대 3문장으로 적습니다."
        lines={summary.improvements}
        onChange={(improvements) => setSummary({ ...summary, improvements })}
      />
      <AxisFields
        label="필요사항"
        help="이 기업이 우리에게 요청하거나, 우리가 지원해야 할 것을 최대 3문장으로 적습니다."
        lines={summary.needs}
        onChange={(needs) => setSummary({ ...summary, needs })}
      />
    </div>
  )
}
