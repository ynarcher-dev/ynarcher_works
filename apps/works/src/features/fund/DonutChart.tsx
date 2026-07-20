export interface DonutSegment {
  label: string
  value: number
}

const COLORS = [
  '#1F3A5F',
  '#B91C1C',
  '#166534',
  '#92400E',
  '#5B6371',
  '#152944',
  '#6E7683',
]

const R = 40
const C = 2 * Math.PI * R

/** LP 지분율 도넛 차트(순수 SVG). */
export function DonutChart({ segments }: { segments: DonutSegment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  let offset = 0

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="h-40 w-40 -rotate-90">
        {total > 0 &&
          segments.map((s, i) => {
            const portion = s.value / total
            const dash = portion * C
            const seg = (
              <circle
                key={s.label}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={COLORS[i % COLORS.length]}
                strokeWidth="14"
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
              />
            )
            offset += dash
            return seg
          })}
      </svg>
      <ul className="space-y-1 text-caption">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="inline-block size-3 rounded-sm"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="text-gray-700">{s.label}</span>
            <span className="tabular-nums text-gray-500">
              {total > 0 ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
