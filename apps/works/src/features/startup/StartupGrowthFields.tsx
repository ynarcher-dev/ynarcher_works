import { Button, Input } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import type { BusinessStatusEntry, GrowthMetric } from '@/features/startup/startupGrowth'

/** 빈 문자열 → undefined, 그 외 숫자로 파싱(콤마 허용). */
function numOrUndef(s: string): number | undefined {
  if (s.trim() === '') return undefined
  const n = Number(s.replace(/,/g, ''))
  return Number.isNaN(n) ? undefined : n
}

/** 숫자 입력 셀(라벨 + number Input). */
function Num({
  label,
  value,
  onChange,
}: {
  label: string
  value?: number | null
  onChange: (v: number | undefined) => void
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-caption text-gray-500">{label}</span>
      <Input type="number" value={value ?? ''} onChange={(e) => onChange(numOrUndef(e.target.value))} />
    </label>
  )
}

/** 텍스트 입력 셀(라벨 + text Input). */
function Txt({
  label,
  value,
  onChange,
}: {
  label: string
  value?: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-caption text-gray-500">{label}</span>
      <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-caption font-semibold text-brand">{title}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>
    </div>
  )
}

interface Props {
  metrics: GrowthMetric[]
  setMetrics: (m: GrowthMetric[]) => void
  businessStatus: BusinessStatusEntry[]
  setBusinessStatus: (b: BusinessStatusEntry[]) => void
}

/**
 * 통합 수정 폼의 '성장 지표' 입력 섹션.
 * 비즈니스 현황(타임라인)과 연도별 지표(재무/매출/고용/투자)를 각각 목록으로 편집한다.
 * 저장은 상위 폼이 growth_metrics / business_status jsonb로 통째 반영한다.
 */
export function StartupGrowthFields({ metrics, setMetrics, businessStatus, setBusinessStatus }: Props) {
  const patchMetric = (i: number, patch: Partial<GrowthMetric>) =>
    setMetrics(metrics.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  const patchStatus = (i: number, patch: Partial<BusinessStatusEntry>) =>
    setBusinessStatus(businessStatus.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  return (
    <div className="space-y-5">
      {/* 비즈니스 타임라인 */}
      <div className="space-y-2">
        <h3 className="text-body font-semibold text-gray-900">비즈니스 타임라인</h3>
        {businessStatus.map((s, i) => (
          <div key={i} className="flex gap-2">
            <Input
              type="date"
              className="w-40"
              value={s.date ?? ''}
              onChange={(e) => patchStatus(i, { date: e.target.value })}
            />
            <Input
              className="flex-1"
              placeholder="현황 내용"
              value={s.content ?? ''}
              onChange={(e) => patchStatus(i, { content: e.target.value })}
            />
            <Button type="button" variant="secondary" onClick={() => setBusinessStatus(businessStatus.filter((_, idx) => idx !== i))}>
              삭제
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setBusinessStatus([...businessStatus, { date: '', content: '' }])}
        >
          현황 추가
        </Button>
      </div>

      {/* 연도별 지표 */}
      <div className="space-y-3">
        <h3 className="text-body font-semibold text-gray-900">연도별 지표</h3>
        {metrics.map((m, i) => (
          <div key={i} className="space-y-3 rounded-radius-md border border-gray-200 p-3">
            <div className="flex items-end justify-between gap-2">
              <label className="block">
                <span className="mb-0.5 block text-caption text-gray-500">연도</span>
                <Input
                  type="number"
                  className="w-28"
                  value={m.year ?? ''}
                  onChange={(e) => patchMetric(i, { year: numOrUndef(e.target.value) ?? 0 })}
                />
              </label>
              <Button type="button" variant="secondary" onClick={() => setMetrics(metrics.filter((_, idx) => idx !== i))}>
                연도 삭제
              </Button>
            </div>
            <Group title="재무">
              <Num label="자산" value={m.assets} onChange={(v) => patchMetric(i, { assets: v })} />
              <Num label="부채" value={m.liabilities} onChange={(v) => patchMetric(i, { liabilities: v })} />
              <Num label="자본" value={m.equity} onChange={(v) => patchMetric(i, { equity: v })} />
            </Group>
            <Group title="매출/손익">
              <Num label="매출액" value={m.revenue} onChange={(v) => patchMetric(i, { revenue: v })} />
              <Num label="영업이익" value={m.operatingProfit} onChange={(v) => patchMetric(i, { operatingProfit: v })} />
              <Num label="당기순이익" value={m.netIncome} onChange={(v) => patchMetric(i, { netIncome: v })} />
            </Group>
            <Group title="고용">
              <Num label="고용 인원" value={m.employeeCount} onChange={(v) => patchMetric(i, { employeeCount: v })} />
            </Group>
            <Group title="투자">
              <Num label="기업 가치(Pre)" value={m.valuation} onChange={(v) => patchMetric(i, { valuation: v })} />
              <Num label="투자유치액" value={m.fundingAmount} onChange={(v) => patchMetric(i, { fundingAmount: v })} />
              <Txt label="라운드" value={m.fundingRound} onChange={(v) => patchMetric(i, { fundingRound: v })} />
              <Txt label="투자자" value={m.investor} onChange={(v) => patchMetric(i, { investor: v })} />
            </Group>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setMetrics([...metrics, { year: new Date().getFullYear() }])}
        >
          연도 추가
        </Button>
      </div>
    </div>
  )
}
