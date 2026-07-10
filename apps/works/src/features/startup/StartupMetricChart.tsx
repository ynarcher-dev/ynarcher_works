import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { GrowthMetric } from '@/features/startup/startupGrowth'

/** 차트 색: 현 UI 톤(브랜드 레드 + 웜그레이). 주 지표=레드, 보조=그레이. */
export const CHART_COLORS = {
  brand: '#E22213',
  gray5: '#737373',
  gray4: '#A3A3A3',
  gray3: '#D4D4D4',
} as const

export interface ChartSeries {
  key: keyof GrowthMetric
  name: string
  color: string
}

/** Y축 원화 눈금 압축 표기(45억 / 30만 / 1,200). */
function wonTick(v: number): string {
  const n = Number(v)
  const a = Math.abs(n)
  if (a >= 1e8) return `${+(n / 1e8).toFixed(1)}억`
  if (a >= 1e4) return `${+(n / 1e4).toFixed(0)}만`
  return `${n.toLocaleString()}`
}

interface Props {
  /** 연도 오름차순(과거→최신) 데이터. */
  data: GrowthMetric[]
  series: ChartSeries[]
  unit?: 'won' | 'count'
}

/**
 * 성장 지표 막대차트(그룹형). 얇고 라운드된 막대 + 옅은 가로 그리드 + 소프트 툴팁으로
 * 현재 UI 톤과 맞춘 심플 스타일. 음수(적자·자본잠식)는 0 기준선 아래로 표시한다.
 */
export function StartupMetricChart({ data, series, unit = 'won' }: Props) {
  const fmt = (v: number) =>
    unit === 'won' ? `${Number(v).toLocaleString()}원` : `${Number(v).toLocaleString()}명`
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="#F0F0F0" />
          <XAxis
            dataKey="year"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: CHART_COLORS.gray4 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={46}
            tick={{ fontSize: 11, fill: CHART_COLORS.gray4 }}
            tickFormatter={unit === 'won' ? wonTick : undefined}
          />
          <ReferenceLine y={0} stroke="#E5E5E5" />
          <Tooltip
            cursor={{ fill: '#F7F7F7' }}
            contentStyle={{
              borderRadius: 8,
              border: '1px solid #E5E5E5',
              boxShadow: '0 8px 20px rgba(0,0,0,0.06)',
              fontSize: 12,
            }}
            formatter={(v: number, name) => [fmt(v), name as string]}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: CHART_COLORS.gray5 }} />
          {series.map((s) => (
            <Bar
              key={String(s.key)}
              dataKey={s.key as string}
              name={s.name}
              fill={s.color}
              radius={[3, 3, 0, 0]}
              maxBarSize={26}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
