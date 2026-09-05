import { CircleDashed, Layers, MapPin, TrendingUp } from 'lucide-react'
import type { ComponentType } from 'react'
import { Card, Skeleton, SummaryTile, type SummaryTileTone } from '@ynarcher/ui'
import { useTags } from '@/features/admin/hooks'
import { FACET_UNSET, useStartupFacetCounts } from '@/features/startup/startupFacetHooks'
import type { StartupPoolFilters, StartupSearchScope } from '@/features/startup/startupPoolHooks'
import { toggleAxisValue } from '@/lib/filterAxis'

/**
 * 타일 색. 축 안에서 순서대로 돌려 쓰며 순서가 곧 색이라 같은 칸은 늘 같은 색이다.
 * 원장이 자라 색이 한 바퀴 돌면 색이 겹치지만, 색은 여기서 구분이 아니라 자리 표시다
 * (무엇인지는 라벨이 답한다).
 */
const TILE_TONES: SummaryTileTone[] = [
  'blue', 'purple', 'cyan', 'amber', 'peach', 'rose', 'lime', 'mint', 'orchid',
]

/** 한 축의 선택 상태. 값 배열과 '미지정'은 서버에서 OR로 묶이는 한 축이다. */
export interface FacetAxisSelection {
  values: string[]
  unset: boolean
}

interface FacetCardProps {
  title: string
  /** 타일 한 칸의 분류 명사(눈썹 문구). */
  noun: string
  /** '전체' 타일의 눈썹 문구. */
  totalEyebrow: string
  /** 미지정 타일의 눈썹 문구 — 무엇이 비어서 여기 모였는지를 적는다. */
  unsetEyebrow: string
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean; strokeWidth?: number }>
  /** 타일 목록(원장 노출순위 순). 값은 필터에 그대로 들어가는 키다. */
  tiles: { key: string; label: string }[]
  counts: Map<string, number>
  total: number
  selection: FacetAxisSelection
  onChange: (next: FacetAxisSelection) => void
  isPending: boolean
}

/**
 * 요약 카드 한 장. 축이 둘(권역·투자단계)이고 두 카드의 생김새·동작이 같아 그리는 일은
 * 여기 하나로 모은다 — 같은 규격을 두 파일에 적으면 한쪽만 고쳐 어긋난다.
 *
 * **타일은 곧 필터다.** 그래서 미지정 칸도 누를 수 있다 — 한 축에 칸의 성격이 하나여야
 * 하고(옆 칸은 눌리는데 이 칸만 안 눌리면 같은 줄에서 칸마다 하는 일이 달라진다),
 * 소재지·투자단계는 등록 시 필수가 아니라 미지정이 '옛 데이터의 잔여'가 아니라 채워 넣을
 * 대기열이기 때문이다.
 *
 * 타일 순서는 건수가 아니라 원장의 노출순위(sort_order)를 따른다. 상시로 서는 카드에서
 * 건수순은 필터를 만질 때마다 칸이 자리를 바꿔 같은 곳을 두 번 누르지 못하게 한다.
 */
function FacetCard({
  title,
  noun,
  totalEyebrow,
  unsetEyebrow,
  icon: Icon,
  tiles,
  counts,
  total,
  selection,
  onChange,
  isPending,
}: FacetCardProps) {
  if (isPending) {
    return <Card title={title}><Skeleton className="h-[7.5rem] rounded-radius-lg" /></Card>
  }

  const selected = new Set(selection.values)
  const unsetCount = counts.get(FACET_UNSET) ?? 0

  return (
    <Card title={title}>
      <section
        aria-label={`필터가 반영된 ${title}`}
        className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3"
      >
        <SummaryTile
          title="전체"
          eyebrow={totalEyebrow}
          value={total}
          unit="개사"
          tone="primary"
          icon={<Layers aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          onClick={() => onChange({ values: [], unset: false })}
          selected={selection.values.length === 0 && !selection.unset}
        />

        {tiles.map((tile, index) => (
          <SummaryTile
            key={tile.key}
            title={tile.label}
            eyebrow={noun}
            value={counts.get(tile.key) ?? 0}
            unit="개사"
            tone={TILE_TONES[index % TILE_TONES.length]}
            icon={<Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />}
            onClick={() =>
              onChange({ values: toggleAxisValue(selection.values, tile.key), unset: selection.unset })
            }
            selected={selected.has(tile.key)}
          />
        ))}

        {/* 해당 행이 없으면 세우지 않는다 — 누를 조건이 없는 칸이라, 남아 있다는 사실을
            말할 때만 뜻이 선다. 이미 골라 둔 상태라면 건수와 무관하게 세운다(고른 칸이
            사라지면 되돌릴 자리가 없다). */}
        {(unsetCount > 0 || selection.unset) && (
          <SummaryTile
            title="미지정"
            eyebrow={unsetEyebrow}
            value={unsetCount}
            unit="개사"
            tone="slate"
            icon={<CircleDashed aria-hidden className="size-[18px]" strokeWidth={1.8} />}
            onClick={() => onChange({ values: selection.values, unset: !selection.unset })}
            selected={selection.unset}
          />
        )}
      </section>
    </Card>
  )
}

interface SummaryProps {
  keyword: string
  filters: StartupPoolFilters
  mineUserId?: string | null
  searchScope: StartupSearchScope
  onChange: (next: FacetAxisSelection) => void
}

/**
 * 권역별 현황 — 목록 위 첫째 줄.
 *
 * 소재지(시·도 17개 + 해외)를 그대로 세우지 않는 이유는 한 줄에 18칸이 서지 못하고 실제
 * 분포도 서울·경기에 몰려 나머지 칸이 상시 0으로 남기 때문이다. NETWORKS 권역 카드가
 * 성립한 것도 국가 수백 개를 권역으로 접었기 때문이지 지역이라서가 아니다.
 *
 * 필터 줄의 '소재지'(시·도)는 걷지 않는다 — 권역의 아래 단이라 함께 걸면 그 시·도만
 * 남는 것이 사실이고, 같은 물음에 두 컨트롤이 답하는 것이 아니다(NETWORKS의 국가 필터와
 * 같은 관계다).
 */
export function StartupRegionSummary({
  keyword,
  filters,
  mineUserId,
  searchScope,
  onChange,
}: SummaryProps) {
  const { data: facets, isPending } = useStartupFacetCounts(keyword, filters, mineUserId, searchScope)
  const { data: regionTags } = useTags('location_region_tags')

  return (
    <FacetCard
      title="권역별 현황"
      noun="권역"
      totalEyebrow="전체 권역"
      unsetEyebrow="소재지 없음"
      icon={MapPin}
      tiles={(regionTags ?? []).map((tag) => ({ key: tag.id, label: tag.name }))}
      counts={facets?.region ?? new Map()}
      total={facets?.regionTotal ?? 0}
      selection={{ values: filters.regions, unset: filters.regionUnset }}
      onChange={onChange}
      isPending={isPending || !regionTags}
    />
  )
}

/**
 * 투자단계별 현황 — 목록 위 둘째 줄.
 *
 * 축이 구분(관계)과 직교해 발굴·보육·투자 어디서든 뜻이 선다. 이 카드가 단계 축을 통째로
 * 소유하므로 필터 줄의 '단계' 칩은 함께 걷었다 — 소재지와 달리 카드와 완전히 같은 값을
 * 묻는 컨트롤이라, 두면 엇갈리게 걸 수 있고 그때 결과가 빈 이유가 화면에 보이지 않는다.
 *
 * 단계는 startups.stage에 태그명 문자열로 저장되므로 타일 키도 태그명이다(권역은 태그 id).
 */
export function StartupStageSummary({
  keyword,
  filters,
  mineUserId,
  searchScope,
  onChange,
}: SummaryProps) {
  const { data: facets, isPending } = useStartupFacetCounts(keyword, filters, mineUserId, searchScope)
  const { data: stageTags } = useTags('investment_stage_tags')

  return (
    <FacetCard
      title="투자단계별 현황"
      noun="투자단계"
      totalEyebrow="전체 단계"
      unsetEyebrow="단계 없음"
      icon={TrendingUp}
      tiles={(stageTags ?? []).map((tag) => ({ key: tag.name, label: tag.name }))}
      counts={facets?.stage ?? new Map()}
      total={facets?.stageTotal ?? 0}
      selection={{ values: filters.stages, unset: filters.stageUnset }}
      onChange={onChange}
      isPending={isPending || !stageTags}
    />
  )
}
