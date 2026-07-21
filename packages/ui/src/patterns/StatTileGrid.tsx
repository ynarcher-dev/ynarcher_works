import { cn } from '../utils/cn'

/** 상태 타일 1개 정의. delta 지정 시 전월 대비 배지를, onClick 지정 시 클릭 이동을 활성화한다. */
export interface StatTile {
  key: string
  label: string
  /** 이미 포맷된 표시값(건수 문자열 등). */
  value: string
  /** 전월 대비 증감(옵션). 지정 시에만 배지 표기. */
  delta?: number
  /** 클릭 이동 핸들러(옵션). 지정 시 해당 타일만 클릭 가능. */
  onClick?: () => void
  /** 총계 등 강조 타일. */
  emphasis?: boolean
}

/** 기본 그리드(5열). 열 수가 다른 대시보드는 className 으로 교체한다. */
const DEFAULT_GRID = 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5'

/** 전월 대비 증감 배지(증가=success·감소=danger·변화 없음=gray). */
function DeltaLabel({ delta }: { delta: number }) {
  if (delta === 0)
    return <p className="mt-0.5 text-caption text-gray-600">전월 대비 &ndash;</p>
  const up = delta > 0
  return (
    <p className="mt-0.5 flex items-center gap-1 text-caption text-gray-600">
      <span>전월 대비</span>
      <span
        className={cn(
          'font-semibold tabular-nums',
          up ? 'text-success' : 'text-danger',
        )}
      >
        {up ? '↑' : '↓'}
        {Math.abs(delta).toLocaleString()}
      </span>
    </p>
  )
}

export interface StatTileGridProps {
  tiles: StatTile[]
  /** 그리드 클래스 오버라이드(열 수는 대시보드마다 다르다). */
  className?: string
}

/**
 * 대시보드 상단 상태 타일 그리드(전 워크스페이스 공용).
 * 타일 규격(패딩·값 폰트·증감 배지)을 한 곳에서 정의해 대시보드 간 상단 카드 높이를 통일한다.
 */
export function StatTileGrid({ tiles, className = DEFAULT_GRID }: StatTileGridProps) {
  return (
    <div className={className}>
      {tiles.map((t) => {
        const clickable = !!t.onClick
        return (
          <button
            key={t.key}
            type="button"
            disabled={!clickable}
            onClick={t.onClick}
            className={cn(
              'rounded-radius-md border px-3 py-2 text-left transition-colors duration-fast',
              t.emphasis
                ? 'border-gray-400 bg-gray-50'
                : 'border-gray-300 bg-white',
              clickable
                ? 'cursor-pointer hover:border-gray-400 hover:bg-gray-50'
                : 'cursor-default',
            )}
          >
            <p className="text-caption text-gray-600">{t.label}</p>
            <p className="text-title-sm font-bold tabular-nums text-gray-900">
              {t.value}
            </p>
            {t.delta !== undefined && <DeltaLabel delta={t.delta} />}
          </button>
        )
      })}
    </div>
  )
}

export interface StatTilePlaceholderGridProps {
  count?: number
  className?: string
}

/** 정의 전(미정) 지표용 플레이스홀더 그리드. 상태 타일과 동일 규격의 점선 타일을 병렬 배치한다. */
export function StatTilePlaceholderGrid({
  count = 5,
  className = DEFAULT_GRID,
}: StatTilePlaceholderGridProps) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="rounded-radius-md border border-dashed border-gray-300 bg-gray-50/40 px-3 py-2"
        >
          <p className="text-caption text-gray-500">준비 중</p>
          <p className="text-title-sm font-bold tabular-nums text-gray-300">&ndash;</p>
          <p className="mt-0.5 text-caption text-gray-300">지표 미정</p>
        </div>
      ))}
    </div>
  )
}
