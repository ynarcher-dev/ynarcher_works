export interface RadarMetric {
  label: string
  value: number // 0~5
}

const SIZE = 220
const CENTER = SIZE / 2
const RADIUS = 80
const MAX = 5

function point(index: number, count: number, value: number): [number, number] {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2
  const r = (value / MAX) * RADIUS
  return [CENTER + r * Math.cos(angle), CENTER + r * Math.sin(angle)]
}

/** 성장 5대 지표 레이더 차트(순수 SVG, 외부 차트 라이브러리 미사용). */
export function RadarChart({ metrics }: { metrics: RadarMetric[] }) {
  const n = metrics.length
  const gridLevels = [1, 2, 3, 4, 5]

  const dataPoints = metrics
    .map((m, i) => point(i, n, m.value).join(','))
    .join(' ')

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-64 w-64"
      role="img"
      aria-label="성장 지표 레이더 차트"
    >
      {gridLevels.map((lvl) => (
        <polygon
          key={lvl}
          points={metrics
            .map((_, i) => point(i, n, lvl).join(','))
            .join(' ')}
          className="fill-none stroke-gray-200"
        />
      ))}
      {metrics.map((m, i) => {
        const [x, y] = point(i, n, MAX)
        const [lx, ly] = point(i, n, MAX + 0.9)
        return (
          <g key={m.label}>
            <line
              x1={CENTER}
              y1={CENTER}
              x2={x}
              y2={y}
              className="stroke-gray-200"
            />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-gray-500 text-[9px]"
            >
              {m.label}
            </text>
          </g>
        )
      })}
      <polygon
        points={dataPoints}
        className="fill-brand/20 stroke-brand"
        strokeWidth={2}
      />
    </svg>
  )
}
