import { Button, PanelCard, cardText } from '@ynarcher/ui'
import { Scale } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { BENCHMARK_MAX, benchmarkPath } from '@/features/startup/benchmarkHooks'
import type { EntityRow } from '@/features/networks/hooks'

/**
 * 상세페이지의 벤치마크 진입점.
 *
 * 비교 자체는 사이드바의 '벤치마크' 화면이 맡고, 여기서는 이 기업을 첫 열에 실은 주소로
 * 보내기만 한다. 비교군이 주소에 있으므로(`?ids=`) 이 진입점은 아무 상태도 들지 않는다.
 */
export function StartupBenchmarkEntry({ record }: { record: EntityRow }) {
  const navigate = useNavigate()
  return (
    <PanelCard title="벤치마크">
      <p className={cardText.label}>
        이 기업을 첫 열에 세우고 최대 {BENCHMARK_MAX}곳까지 나란히 비교합니다.
      </p>
      <Button
        variant="outline"
        className="mt-3"
        onClick={() => navigate(benchmarkPath([record.id]))}
      >
        <Scale className="mr-1 size-3.5" aria-hidden />
        벤치마크에서 비교
      </Button>
    </PanelCard>
  )
}
