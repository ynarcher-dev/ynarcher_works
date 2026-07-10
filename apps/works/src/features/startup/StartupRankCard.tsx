import { Banner, cn, Spinner } from '@ynarcher/ui'
import { useMemo, useState, type ReactNode } from 'react'
import { useEntityList, type EntityRow } from '@/features/networks/hooks'
import { readIndustries } from '@/features/startup/startupGrowth'
import {
  peerGroup,
  rankInGroup,
  yearBucket,
  RANK_METRICS,
  type RankMode,
  type RankResult,
} from '@/features/startup/startupRanking'

/** 금액(천원, ÷1000 반올림)/인원(명) 값 텍스트. 값 없으면 '정보 없음'. */
function valueText(value: number | null, money: boolean): string {
  if (value == null) return '정보 없음'
  if (!money) return `${value.toLocaleString()}명`
  const n = Math.round(value / 1000)
  return n < 0 ? `▼${Math.abs(n).toLocaleString()}` : n.toLocaleString()
}

/** 순위 한 줄: 항목명 · 값 · 순위(N위/M개 · 상위 X%). */
function RankRow({ label, res, money }: { label: string; res: RankResult; money: boolean }) {
  const hasRank = res.rank != null
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-2 py-1.5">
      <span className="text-caption text-gray-400">{label}</span>
      <span
        className={cn(
          'min-w-0 truncate text-caption tabular-nums',
          money && res.value != null && res.value < 0 ? 'text-danger' : 'text-gray-800',
        )}
      >
        {valueText(res.value, money)}
      </span>
      {hasRank ? (
        <span className="whitespace-nowrap text-right text-caption tabular-nums">
          <span className="font-bold text-gray-900">{res.rank}위</span>
          <span className="text-gray-400"> / {res.total}개</span>
          {res.percentile != null && <span className="ml-1 text-gray-400">상위 {res.percentile}%</span>}
        </span>
      ) : (
        <span className="text-right text-caption text-gray-300">-</span>
      )}
    </div>
  )
}

/** 지표 그룹(밴드형 제목 + 순위 행 묶음). */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="rounded-radius-sm bg-gray-50 px-2.5 py-1 text-caption font-semibold text-gray-500">{title}</p>
      <div className="mt-0.5 divide-y divide-gray-50">{children}</div>
    </div>
  )
}

const MODES: { key: RankMode; label: string }[] = [
  { key: 'industry', label: '산업태그' },
  { key: 'year', label: '설립년차' },
]

/**
 * 순위 카드(벤치마크 섹션). 현재 기업이 '산업태그' 또는 '설립년차' 모집단 안에서
 * 9개 지표별로 몇 위인지 제시한다. 값은 기업별 최신 연도부터의 최초 유효값을 쓴다.
 * 모집단·순위는 풀 전체(useEntityList)를 클라이언트에서 집계한다(풀 규모가 작아 충분).
 */
export function StartupRankCard({ record }: { record: EntityRow }) {
  const [mode, setMode] = useState<RankMode>('industry')
  const { data: pool, isLoading } = useEntityList('startups', '')

  const group = useMemo(
    () => (pool ? peerGroup(record, pool as EntityRow[], mode) : null),
    [pool, record, mode],
  )

  // 모집단 기준 라벨(공유 산업 태그 목록 또는 년차 구간).
  const basisLabel =
    mode === 'industry' ? readIndustries(record).join(' · ') : (yearBucket(record.founded_on)?.label ?? '')

  return (
    <section className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-body font-semibold text-gray-900">순위</h3>
        <div className="flex rounded-radius-md border border-gray-200 p-0.5">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={cn(
                'rounded-radius-sm px-2.5 py-1 text-caption transition-colors',
                mode === m.key ? 'bg-brand/10 font-medium text-brand' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-8">
          <Spinner />
        </div>
      ) : group == null ? (
        <Banner tone="info">
          {mode === 'industry'
            ? '산업 태그가 없어 순위를 계산할 수 없습니다. 수정에서 산업을 선택하세요.'
            : '설립일이 없어 년차 순위를 계산할 수 없습니다. 수정에서 설립일을 입력하세요.'}
        </Banner>
      ) : (
        <>
          <p className="mb-3 text-caption text-gray-400">
            {mode === 'industry' ? '산업태그' : '설립년차'} <span className="text-gray-600">{basisLabel}</span> · 동일
            모집단 {group.length}개 기업 중
          </p>
          <p className="mb-2 text-right text-caption text-gray-400">단위: 천원</p>
          <div className="space-y-3">
            {['재무 현황', '매출 현황', '고용 현황', '투자 현황'].map((title) => (
              <Group key={title} title={title}>
                {RANK_METRICS.filter((d) => d.group === title).map((d) => (
                  <RankRow key={d.key} label={d.label} money={d.money} res={rankInGroup(record, group, d)} />
                ))}
              </Group>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
