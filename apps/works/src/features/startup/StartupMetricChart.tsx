import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/**
 * 차트 색. 성장 지표의 다계열(재무·매출·투자)은 categorical 팔레트(정체성별 유채색)로 칠해
 * 보조 계열이 '비활성 그레이'로 오인되지 않게 한다 — 슬롯 순서 고정: 네이비→틸→앰버.
 * 세 색을 같은 무게(딥 주얼톤: 딥네이비·딥에메랄드·딥골드)로 맞춰 채도·명도가 '들쑥날쑥'하지 않게 통일.
 * 흰 배경 대비 전부 3:1↑. 표의 '음수=파랑'과는 명도 차(딥네이비 11.5:1)로 구분한다.
 * gray*는 축·범례 텍스트와 주주 차트 slice 색으로 계속 사용한다.
 */
export const CHART_COLORS = {
  brand: '#1F3A5F', // 슬롯1(주 지표) — 브랜드 네이비
  teal: '#0A7D55', // 슬롯2 — 딥에메랄드
  amber: '#9A6300', // 슬롯3 — 딥골드
  gray5: '#5B6371',
  gray4: '#6E7683',
  gray3: '#CBD0D8',
} as const

/**
 * 차트 텍스트 규격(축 눈금·범례·툴팁 공용).
 *
 * recharts는 Tailwind 클래스를 받지 않아 숫자로 줄 수밖에 없지만, 값 자체는 토큰과 맞춘다.
 * 12px는 `caption`(0.75rem), 색은 `gray-500`(#5B6371)로 표의 머리글(`tableText.head`)과 같은
 * 단계다. 종전에는 축·범례가 11px이었는데 11px 토큰(`tag-card`)은 배지 전용이라 스케일 밖이었고,
 * 축(11)·툴팁(12)이 서로 어긋나 한 차트 안에 두 크기가 존재했다.
 */
export const CHART_TEXT = { size: 12, color: '#5B6371' } as const

export interface ChartSeries {
  key: string
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
  /** 시간 오름차순(과거→최신) 데이터. 항목별 지표 원소(FinanceEntry 등)를 그대로 받는다. */
  data: object[]
  series: ChartSeries[]
  unit?: 'won' | 'count'
  /** 'bar'(기본) 그룹형 막대 / 'line' 꺾은선. 고용·투자처럼 추세를 보는 지표는 line 사용. */
  variant?: 'bar' | 'line'
  /** x축 데이터 키. 연도 기준은 'year'(기본), 투자처럼 월 기준은 'date'. */
  xKey?: string
}

/**
 * 성장 지표 차트. 기본은 그룹형 막대(재무·매출), variant="line"이면 꺾은선(고용·투자).
 * 얇은 마크 + 옅은 가로 그리드 + 소프트 툴팁으로 현재 UI 톤과 맞춘 심플 스타일.
 * 음수(적자·자본잠식)는 0 기준선 아래로 표시한다.
 */
export function StartupMetricChart({ data, series, unit = 'won', variant = 'bar', xKey = 'year' }: Props) {
  const fmt = (v: number) =>
    unit === 'won' ? `${Number(v).toLocaleString()}원` : `${Number(v).toLocaleString()}명`
  // 축·그리드·툴팁·범례는 막대/꺾은선 공용. recharts가 직속 자식만 훑으므로 Fragment로 묶지 않고
  // 각 차트 안에 배열로 펼쳐 넣는다(각 요소 key 필수).
  const axes = [
    <CartesianGrid key="grid" vertical={false} stroke="#EDEFF2" />,
    <XAxis
      key="x"
      dataKey={xKey}
      tickLine={false}
      axisLine={false}
      tick={{ fontSize: CHART_TEXT.size, fill: CHART_TEXT.color }}
    />,
    <YAxis
      key="y"
      tickLine={false}
      axisLine={false}
      width={46}
      tick={{ fontSize: CHART_TEXT.size, fill: CHART_TEXT.color }}
      tickFormatter={unit === 'won' ? wonTick : undefined}
    />,
    <ReferenceLine key="zero" y={0} stroke="#DFE2E7" />,
    <Tooltip
      key="tip"
      cursor={variant === 'line' ? { stroke: '#DFE2E7' } : { fill: '#F5F6F8' }}
      contentStyle={{
        borderRadius: 8,
        border: '1px solid #DFE2E7',
        boxShadow: '0 8px 20px rgba(0,0,0,0.06)',
        fontSize: CHART_TEXT.size,
      }}
      formatter={(v: number, name) => [fmt(v), name as string]}
    />,
    <Legend key="legend" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: CHART_TEXT.size, color: CHART_TEXT.color }} />,
  ]
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {variant === 'line' ? (
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            {axes}
            {series.map((s) => (
              <Line
                key={String(s.key)}
                type="monotone"
                dataKey={s.key as string}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
            {axes}
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
        )}
      </ResponsiveContainer>
    </div>
  )
}
