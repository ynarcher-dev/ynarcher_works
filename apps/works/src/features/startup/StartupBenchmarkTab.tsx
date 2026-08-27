import { Button, Card, Select, Spinner, TextAction, cardText, cn } from '@ynarcher/ui'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { StartupBenchmarkMatrix } from '@/features/startup/StartupBenchmarkMatrix'
import { StartupBenchmarkPicker } from '@/features/startup/StartupBenchmarkPicker'
import {
  BENCHMARK_MAX,
  useBenchmarkCompanies,
  useBenchmarkSelection,
} from '@/features/startup/benchmarkHooks'
import { availableYears, snapshotOf } from '@/features/startup/benchmarkMetrics'

/** 아직 아무 기업도 담기지 않은 화면. 이 자리가 무엇을 하는 곳인지부터 알려준다. */
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-radius-md border border-dashed border-gray-300 px-4 py-16 text-center">
      <p className={cardText.label}>
        비교할 기업을 골라 나란히 세웁니다. 최대 {BENCHMARK_MAX}곳까지 담을 수 있습니다.
      </p>
      <Button variant="outline" onClick={onAdd}>
        <Plus className="mr-1 size-3.5" aria-hidden />
        기업 추가
      </Button>
    </div>
  )
}

/**
 * 벤치마크 화면(`/startup?tab=benchmark`).
 *
 * 원래는 스타트업 상세페이지 우측 열 최하단의 '기업 비교' 카드였다. 두 기업 좌우 비교라는
 * 형태가 그 카드 폭(1/3 열)에 묶여 있었고, 비교군을 바꾸려면 그 기업 상세로 먼저 들어가야 했다.
 * 사이드바 항목으로 올리면서 비교군은 화면 상태가 아니라 주소가 들고 있게 되고(`?ids=`),
 * 상세페이지는 그 기업 하나를 실은 링크를 건네는 진입점이 된다.
 */
export function StartupBenchmarkTab() {
  const { ids, year, add, remove, setYear, clear } = useBenchmarkSelection()
  const [pickerOpen, setPickerOpen] = useState(false)
  const { data: companies, isLoading } = useBenchmarkCompanies(ids)

  const rows = useMemo(() => companies ?? [], [companies])
  const years = useMemo(() => availableYears(rows), [rows])

  // 담은 기업이 실적을 가진 연도만 선택지로 둔다. 비교군이 바뀌어 사라진 연도를 고르고 있으면
  // 조용히 '각사 최신'으로 되돌린다 — 아무 열도 값이 없는 표를 보여주는 것보다 낫다.
  const effectiveYear = year != null && years.includes(year) ? year : null
  const snapshots = useMemo(
    () => rows.map((r) => snapshotOf(r, effectiveYear)),
    [rows, effectiveYear],
  )

  return (
    <Card bodyClassName="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setPickerOpen(true)}
            disabled={ids.length >= BENCHMARK_MAX}
            title={ids.length >= BENCHMARK_MAX ? `최대 ${BENCHMARK_MAX}곳까지 비교합니다` : undefined}
          >
            <Plus className="mr-1 size-3.5" aria-hidden />
            기업 추가
          </Button>
          <span className={cn(cardText.meta, 'tabular-nums')}>
            {ids.length}/{BENCHMARK_MAX}
          </span>
          {ids.length > 0 && <TextAction onClick={clear}>초기화</TextAction>}
        </div>

        <div className="flex items-center gap-2">
          {/* 기준연도 — 열마다 다른 연도의 실적을 나란히 놓으면 그것은 비교가 아니다.
              기본값('각사 최신')은 데이터가 성긴 초기 기업까지 한 줄이라도 보여주기 위한 것이고,
              연도를 고정하면 그 해 실적이 없는 열은 '정보 없음'으로 정직하게 비워진다. */}
          <label className={cardText.label} htmlFor="benchmark-base-year">
            기준연도
          </label>
          <Select
            id="benchmark-base-year"
            className="w-32"
            value={effectiveYear == null ? '' : String(effectiveYear)}
            onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">각사 최신</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </Select>
        </div>
      </div>

      {ids.length === 0 ? (
        <EmptyState onAdd={() => setPickerOpen(true)} />
      ) : isLoading && rows.length === 0 ? (
        <div className="py-16">
          <Spinner />
        </div>
      ) : (
        <StartupBenchmarkMatrix snapshots={snapshots} onRemove={remove} />
      )}

      <StartupBenchmarkPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={add}
        excludeIds={ids}
      />
    </Card>
  )
}
