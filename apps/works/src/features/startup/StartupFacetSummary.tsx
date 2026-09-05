import {
  Building2,
  CircleDashed,
  HandCoins,
  Layers,
  MapPin,
  Search,
  Sprout,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { Card, Skeleton, SummaryTile, type SummaryTileTone } from '@ynarcher/ui'
import { useTags } from '@/features/admin/hooks'
import { FACET_UNSET, useStartupFacetCounts } from '@/features/startup/startupFacetHooks'
import {
  MANAGEMENT_STATUS_LABEL,
  type ManagementStatus,
} from '@/features/startup/startupClassification'
import type { StartupPoolFilters, StartupSearchScope } from '@/features/startup/startupPoolHooks'
import { toggleAxisValue } from '@/lib/filterAxis'

/** 타일 아이콘의 최소 형태. 화면에서 쓰는 속성만 좁혀 받는다. */
type TileIcon = ComponentType<{ className?: string; 'aria-hidden'?: boolean; strokeWidth?: number }>

/**
 * 권역 타일 색. 축 안에서 순서대로 돌려 쓰며 순서가 곧 색이라 같은 칸은 늘 같은 색이다.
 * 원장이 자라 색이 한 바퀴 돌면 색이 겹치지만, 색은 여기서 구분이 아니라 자리 표시다
 * (무엇인지는 라벨이 답한다).
 */
const REGION_TONES: SummaryTileTone[] = [
  'blue', 'purple', 'cyan', 'amber', 'peach', 'rose', 'lime', 'mint', 'orchid',
]

/** 한 축의 선택 상태. 값 배열과 '미지정'은 서버에서 OR로 묶이는 한 축이다. */
export interface FacetAxisSelection {
  values: string[]
  unset: boolean
}

/** 타일 한 칸. 아이콘·눈썹을 주지 않으면 카드의 기본값을 쓴다. */
interface FacetTile {
  key: string
  label: string
  eyebrow?: string
  icon?: TileIcon
  tone?: SummaryTileTone
}

interface FacetCardProps {
  title: string
  /** 타일 한 칸의 분류 명사(눈썹 문구 기본값). */
  noun: string
  /** '전체' 타일의 눈썹 문구. */
  totalEyebrow: string
  /** 미지정 타일의 이름. 축마다 '비어 있다'가 뜻하는 말이 다르다. */
  unsetLabel?: string
  /**
   * 미지정 타일의 눈썹 문구 — 무엇이 비어서 여기 모였는지를 적는다.
   * 주지 않으면 그 축에는 미지정 칸을 두지 않는다(값이 빌 수 없는 축).
   */
  unsetEyebrow?: string
  icon: TileIcon
  /** 타일 목록(고정 순서). 값은 필터에 그대로 들어가는 키다. */
  tiles: FacetTile[]
  counts: Map<string, number>
  total: number
  selection: FacetAxisSelection
  onChange: (next: FacetAxisSelection) => void
  isPending: boolean
}

/**
 * 요약 카드 한 장. 축이 둘(구분·권역)이고 두 카드의 생김새·동작이 같아 그리는 일은
 * 여기 하나로 모은다 — 같은 규격을 두 파일에 적으면 한쪽만 고쳐 어긋난다.
 *
 * **타일은 곧 필터다.** 그래서 미지정 칸도 누를 수 있다 — 한 축에 칸의 성격이 하나여야
 * 하고(옆 칸은 눌리는데 이 칸만 안 눌리면 같은 줄에서 칸마다 하는 일이 달라진다), 값이 빈
 * 행도 목록의 행이라 카드의 합이 곧 전체여야 하기 때문이다.
 *
 * 다만 **값이 빌 수 없는 축에는 그 칸을 두지 않는다**(`unsetEyebrow`를 주지 않는다). 구분이
 * 그렇다 — 원장이 NOT NULL이고 기본값이 '미지정 기업'이라, 미지정은 빈칸이 아니라 값 하나로
 * 이미 타일 줄에 서 있다.
 *
 * 타일 순서는 건수가 아니라 고정 순서(구분은 코드 목록, 권역은 원장의 노출순위)를 따른다.
 * 상시로 서는 카드에서 건수순은 필터를 만질 때마다 칸이 자리를 바꿔 같은 곳을 두 번 누르지
 * 못하게 한다.
 */
function FacetCard({
  title,
  noun,
  totalEyebrow,
  unsetLabel = '미지정',
  unsetEyebrow,
  icon: CardIcon,
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

        {tiles.map((tile, index) => {
          const Icon = tile.icon ?? CardIcon
          return (
            <SummaryTile
              key={tile.key}
              title={tile.label}
              eyebrow={tile.eyebrow ?? noun}
              value={counts.get(tile.key) ?? 0}
              unit="개사"
              tone={tile.tone ?? REGION_TONES[index % REGION_TONES.length]}
              icon={<Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />}
              onClick={() =>
                onChange({
                  values: toggleAxisValue(selection.values, tile.key),
                  unset: selection.unset,
                })
              }
              selected={selected.has(tile.key)}
            />
          )
        })}

        {/* 해당 행이 없으면 세우지 않는다 — 누를 조건이 없는 칸이라, 남아 있다는 사실을
            말할 때만 뜻이 선다. 이미 골라 둔 상태라면 건수와 무관하게 세운다(고른 칸이
            사라지면 되돌릴 자리가 없다). */}
        {unsetEyebrow && (unsetCount > 0 || selection.unset) && (
          <SummaryTile
            title={unsetLabel}
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

/**
 * 구분 타일(2026-09-05 사용자 지정 순서). 코드 목록(`MANAGEMENT_STATUSES`)은 생애주기 순
 * (발굴 → 보육 → 투자)이지만 카드는 **투자기업이 먼저** 선다 — 목록에 들어와 가장 자주
 * 좁히는 칸을 첫 자리에 두는 것이고, 코드 순서 자체를 바꾸지는 않는다(그 순서는 셀렉트·
 * 배지·문서가 함께 쓰는 값이다).
 *
 * 이름은 여기 적지 않고 `MANAGEMENT_STATUS_LABEL`에서 읽는다 — 라벨을 두 곳에 적으면
 * 한쪽만 고쳐 카드와 배지가 다른 말을 하게 된다(2026-09-06에 '기타기업'이 '미지정 기업'으로
 * 바뀌며 실제로 겪을 뻔한 자리다).
 */
const CATEGORY_TILES: FacetTile[] = (
  [
    { key: 'invested', eyebrow: '투자 포트폴리오', icon: HandCoins, tone: 'purple' },
    { key: 'incubated', eyebrow: '육성 및 지원', icon: Sprout, tone: 'mint' },
    { key: 'sourced', eyebrow: '발굴 및 검토', icon: Search, tone: 'amber' },
    // 새로 등록하는 기업이 기본으로 들어오는 칸이다 — 무엇인지 정해지면 담당자가 옮긴다.
    // 색과 아이콘은 권역 카드의 미지정 칸과 같은 회색·점선 원이다. 값이 하나 더 있는 것이
    // 아니라 '아직 안 정함'이라는 사실을 말하는 칸이라, 다른 구분과 같은 색을 쓰면 나란한
    // 분류처럼 읽힌다 — 두 카드에서 같은 뜻의 칸은 같은 모양이어야 한다.
    { key: 'other', eyebrow: '분류 대기', icon: CircleDashed, tone: 'slate' },
  ] satisfies (Omit<FacetTile, 'key' | 'label'> & { key: ManagementStatus })[]
).map((t) => ({ ...t, label: MANAGEMENT_STATUS_LABEL[t.key] }))

interface SummaryProps {
  keyword: string
  filters: StartupPoolFilters
  mineUserId?: string | null
  searchScope: StartupSearchScope
  onChange: (next: FacetAxisSelection) => void
}

/**
 * 기업 현황 — 목록 위 첫째 줄.
 *
 * 구분(이 기업이 우리와 어떤 관계인가)은 목록에 들어와 가장 먼저 묻는 축이라 맨 위에 선다.
 * 이 카드가 구분 축을 통째로 소유하므로 필터 줄의 '구분' 칩은 걷었다 — 같은 값을 묻는
 * 컨트롤이 둘이면 엇갈리게 걸 수 있고, 그때 결과가 빈 이유가 화면 어디에도 보이지 않는다.
 */
export function StartupCategorySummary({
  keyword,
  filters,
  mineUserId,
  searchScope,
  onChange,
}: SummaryProps) {
  const { data: facets, isPending } = useStartupFacetCounts(keyword, filters, mineUserId, searchScope)

  return (
    <FacetCard
      title="기업 현황"
      noun="구분"
      totalEyebrow="스타트업 DB"
      icon={Building2}
      tiles={CATEGORY_TILES}
      counts={facets?.category ?? new Map()}
      total={facets?.categoryTotal ?? 0}
      selection={{ values: filters.categories, unset: false }}
      onChange={onChange}
      isPending={isPending}
    />
  )
}

/**
 * 권역별 현황 — 목록 위 둘째 줄.
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
