import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import {
  CHART_CATEGORICAL,
  CHART_LABEL_LINE,
  CHART_NEUTRAL,
  CHART_STROKE,
  CHART_TOOLTIP_STYLE,
  isNeutralLabel,
} from '@/features/networks/dashboard/chartPalette'
import type { CategoryDatum } from '@/features/networks/dashboard/CategoryBarList'

/**
 * 도넛 파이 차트(범주형 분포). 부모 높이를 꽉 채워 중앙 정렬한다.
 * 슬라이스 바깥에 '라벨 건수'를 상시 표기(호버 불필요), 미지정은 gray로 마감한다.
 */
export function CategoryPie({ data }: { data: CategoryDatum[] }) {
  const slices = data.filter((d) => d.count > 0)
  if (slices.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-caption text-gray-600">표시할 데이터가 없습니다.</p>
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={slices}
          dataKey="count"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius="40%"
          outerRadius="82%"
          paddingAngle={1.5}
          stroke={CHART_STROKE}
          strokeWidth={2}
          label={({ name, value }) => `${name} ${Number(value).toLocaleString()}`}
          labelLine={{ stroke: CHART_LABEL_LINE }}
        >
          {slices.map((s, i) => (
            <Cell
              key={s.label}
              fill={isNeutralLabel(s.label) ? CHART_NEUTRAL : CHART_CATEGORICAL[i % CHART_CATEGORICAL.length]}
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number, n) => [`${v.toLocaleString()}건`, n as string]}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span className="text-caption text-gray-700">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
