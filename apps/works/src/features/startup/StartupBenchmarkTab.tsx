import {
  Button,
  EmptyState,
  ListToolbar,
  Select,
  Spinner,
  cn,
  formText,
  tableTextScale,
} from '@ynarcher/ui'
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

/**
 * 벤치마크 화면(`/startup?tab=benchmark`).
 *
 * 원래는 스타트업 상세페이지 우측 열 최하단의 '기업 비교' 카드였다. 두 기업 좌우 비교라는
 * 형태가 그 카드 폭(1/3 열)에 묶여 있었고, 비교군을 바꾸려면 그 기업 상세로 먼저 들어가야 했다.
 * 사이드바 항목으로 올리면서 비교군은 화면 상태가 아니라 주소가 들고 있게 되고(`?ids=`),
 * 상세페이지는 그 기업 하나를 실은 링크를 건네는 진입점이 된다.
 *
 * 화면 구성은 목록 화면과 같은 한 벌이다 — 컨트롤 행(ListToolbar) 다음에 표가 오고, 표는
 * 자기 테두리를 자기가 그린다(DataTable과 같은 규격). 한때 전체를 카드로 감쌌더니 컨트롤과
 * 표가 한 상자 안에 들어가 열 구분이 묻혔다.
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

  const addButton = (
    <Button
      variant="outline"
      onClick={() => setPickerOpen(true)}
      disabled={ids.length >= BENCHMARK_MAX}
      title={ids.length >= BENCHMARK_MAX ? `최대 ${BENCHMARK_MAX}곳까지 비교합니다` : undefined}
    >
      <Plus className="mr-1 size-3.5" aria-hidden />
      기업 추가
    </Button>
  )

  return (
    <div className="space-y-4">
      <ListToolbar
        filters={
          <div className="flex items-center gap-2">
            {/* 기준연도 — 열마다 다른 연도의 실적을 나란히 놓으면 그것은 비교가 아니다.
                기본값('각사 최신')은 데이터가 성긴 초기 기업까지 한 줄이라도 보여주기 위한 것이고,
                연도를 고정하면 그 해 실적이 없는 열은 '정보 없음'으로 정직하게 비워진다. */}
            <label className={formText.label} htmlFor="benchmark-base-year">
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
        }
        actions={
          <div className="flex items-center gap-2">
            {/* 담긴 수/상한 — 옆 버튼과 같은 크기(본문)에 색만 한 단 연하게 둔다. 크기를 줄이면
                한 줄 안에서 크기로 위계를 만드는 셈이라 원칙(densityScale)에 어긋난다. */}
            <span className={cn(tableTextScale.page.meta, 'tabular-nums')}>
              {ids.length}/{BENCHMARK_MAX}
            </span>
            {/* 초기화 — 바로 옆 '기업 추가'와 같은 줄에서 같은 일(비교군 편집)을 하므로 같은
                생김새로 세운다. 글자 링크로 두었더니 버튼 옆에서 누를 수 있는 것으로 읽히지
                않았다. */}
            {ids.length > 0 && (
              <Button variant="outline" onClick={clear}>
                초기화
              </Button>
            )}
            {addButton}
          </div>
        }
      />

      {ids.length === 0 ? (
        <EmptyState
          title="비교할 기업이 없습니다"
          description={`기업을 골라 나란히 세웁니다. 최대 ${BENCHMARK_MAX}곳까지 담을 수 있습니다.`}
          action={addButton}
        />
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
    </div>
  )
}
