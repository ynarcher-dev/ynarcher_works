import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { CHART_COLORS } from '@/features/startup/StartupMetricChart'
import type { Shareholder } from '@/features/startup/startupShareholders'

/** 도넛 슬라이스 색 순서: 브랜드 레드 → 웜그레이 단계별(현 UI 톤). 초과분은 순환. */
const SLICE_COLORS = [
  CHART_COLORS.brand,
  CHART_COLORS.gray5,
  CHART_COLORS.gray4,
  CHART_COLORS.gray3,
  '#525252',
  '#8A8A8A',
  '#C4C4C4',
]

interface Slice {
  name: string
  value: number
  pct: number | null
}

/** 슬라이스 값·지분율을 계산한다. 지분율이 있으면 그 값을, 없으면 주식 수 비중을 쓴다. */
function toSlices(shareholders: Shareholder[]): Slice[] {
  const totalShares = shareholders.reduce((s, h) => s + (Number(h.shares) || 0), 0)
  return shareholders
    .map((h) => {
      const pct = h.percentage != null && !Number.isNaN(Number(h.percentage)) ? Number(h.percentage) : null
      const value = pct ?? (totalShares > 0 ? ((Number(h.shares) || 0) / totalShares) * 100 : 0)
      return { name: h.name || '-', value, pct }
    })
    .filter((s) => s.value > 0)
}

/**
 * 주주 구성 도넛 차트. 슬라이스 바깥에 "이름 지분율%" 라벨 + 하단 범례.
 * 현 UI 톤(브랜드 레드 + 웜그레이)에 맞춘 얇은 도넛 스타일.
 */
export function StartupShareholderChart({ shareholders }: { shareholders: Shareholder[] }) {
  const slices = toSlices(shareholders)
  if (slices.length === 0) return null

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="40%"
            outerRadius="82%"
            paddingAngle={1.5}
            stroke="#FFFFFF"
            strokeWidth={2}
            label={({ name, value }) => `${name} ${Number(value).toFixed(1)}%`}
            labelLine={{ stroke: '#CBD0D8' }}
          >
            {slices.map((_, i) => (
              <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: '1px solid #DFE2E7',
              boxShadow: '0 8px 20px rgba(0,0,0,0.06)',
              fontSize: 12,
            }}
            formatter={(v: number) => [`${Number(v).toFixed(1)}%`, '지분율']}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: CHART_COLORS.gray5 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
