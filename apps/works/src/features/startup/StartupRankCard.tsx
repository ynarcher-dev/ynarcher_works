import { Banner, cn, Spinner } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { useEntityList, type EntityRow } from '@/features/networks/hooks'
import { readIndustries } from '@/features/startup/startupGrowth'
import {
  peerGroup,
  rankInGroup,
  yearBucket,
  modeKey,
  RANK_METRICS,
  type RankMode,
} from '@/features/startup/startupRanking'

/** 금액(천원, ÷1000 반올림)/인원(명) 값 텍스트. 값 없으면 '-'. */
function valueText(value: number | null, money: boolean): string {
  if (value == null) return '-'
  if (!money) return `${Math.round(value).toLocaleString()}명`
  const n = Math.round(value / 1000)
  return n < 0 ? `▼${Math.abs(n).toLocaleString()}` : n.toLocaleString()
}

/** 지표 그룹 밴드 순서(비교 카드와 동일). */
const GROUP_TITLES = ['재무 현황', '매출 현황', '고용 현황', '투자 현황']

/**
 * 순위 카드(벤치마크 섹션). 산업 태그마다 별도 탭 + '설립년차' 탭을 두고, 선택한 모집단
 * 안에서 9개 지표별로 해당기업 값·모집단 평균/중앙값·상위%를 데이터 테이블로 제시한다.
 * 값은 기업별 최신 연도부터의 최초 유효값을 쓰고, 모집단은 풀 전체(useEntityList)를
 * 클라이언트에서 집계한다(풀 규모가 작아 충분). 컬럼이 많아 좁은 폭에서는 가로 스크롤한다.
 */
export function StartupRankCard({ record }: { record: EntityRow }) {
  // 탭: 회사의 산업 태그마다 하나씩(최대 3) + 설립년차. 태그가 없으면 설립년차만.
  const tags = readIndustries(record)
  const modes: RankMode[] = [...tags.map((tag) => ({ type: 'tag', tag }) as const), { type: 'year' } as const]
  const [mode, setMode] = useState<RankMode>(modes[0]!)

  const { data: pool, isLoading } = useEntityList('startups', '')

  const group = useMemo(
    () => (pool ? peerGroup(record, pool as EntityRow[], mode) : null),
    [pool, record, mode],
  )

  const basisLabel = mode.type === 'tag' ? mode.tag : (yearBucket(record.founded_on)?.label ?? '')
  const activeKey = modeKey(mode)

  return (
    <section className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body font-semibold text-gray-900">순위</h3>
        <div className="flex flex-wrap rounded-radius-md border border-gray-200 p-0.5">
          {modes.map((m) => {
            const key = modeKey(m)
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'rounded-radius-sm px-2.5 py-1 text-caption transition-colors',
                  activeKey === key ? 'bg-brand/10 font-medium text-brand' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {m.type === 'tag' ? m.tag : '설립년차'}
              </button>
            )
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="py-8">
          <Spinner />
        </div>
      ) : group == null ? (
        <Banner tone="info">설립일이 없어 년차 순위를 계산할 수 없습니다. 수정에서 설립일을 입력하세요.</Banner>
      ) : (
        <>
          <p className="mb-1 text-caption text-gray-400">
            {mode.type === 'tag' ? '산업태그' : '설립년차'} <span className="text-gray-600">{basisLabel}</span> · 동일
            모집단 {group.length}개 기업 중 · 금액 단위: 천원
          </p>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[20rem] border-collapse text-caption tabular-nums">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400">
                  <th className="py-1.5 pl-1 pr-2 text-left font-medium">항목</th>
                  <th className="px-2 py-1.5 text-right font-medium">해당기업</th>
                  <th className="px-2 py-1.5 text-right font-medium">평균</th>
                  <th className="px-2 py-1.5 text-right font-medium">중앙</th>
                  <th className="py-1.5 pl-2 pr-1 text-right font-medium">상위</th>
                </tr>
              </thead>
              {GROUP_TITLES.map((title) => (
                <tbody key={title}>
                  <tr>
                    <td colSpan={5} className="bg-gray-50 px-1 py-1 text-caption font-semibold text-gray-500">
                      {title}
                    </td>
                  </tr>
                  {RANK_METRICS.filter((d) => d.group === title).map((d) => {
                    const res = rankInGroup(record, group, d)
                    const negative = d.money && res.value != null && res.value < 0
                    return (
                      <tr key={d.key} className="border-t border-gray-50">
                        <td className="py-1.5 pl-1 pr-2 text-gray-500">{d.label}</td>
                        <td
                          className={cn(
                            'px-2 py-1.5 text-right font-semibold',
                            negative ? 'text-danger' : 'text-gray-900',
                          )}
                        >
                          {valueText(res.value, d.money)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray-500">{valueText(res.mean, d.money)}</td>
                        <td className="px-2 py-1.5 text-right text-gray-500">{valueText(res.median, d.money)}</td>
                        <td className="whitespace-nowrap py-1.5 pl-2 pr-1 text-right">
                          {res.percentile != null ? (
                            <span className="font-semibold text-brand">상위 {res.percentile}%</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              ))}
            </table>
          </div>
        </>
      )}
    </section>
  )
}
