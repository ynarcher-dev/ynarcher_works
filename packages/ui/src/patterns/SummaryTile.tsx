import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export type SummaryTileTone = 'primary' | 'blue' | 'purple' | 'mint' | 'rose' | 'amber' | 'cyan' | 'lime' | 'peach' | 'indigo' | 'slate' | 'orchid'

const toneClass: Record<SummaryTileTone, {
  surface: string
  icon: string
  value: string
  chip: string
}> = {
  primary: {
    surface: 'bg-brand-700',
    icon: 'bg-white/15 text-white',
    value: 'text-white',
    chip: 'text-white/80',
  },
  blue: {
    surface: 'bg-summary-blue-surface',
    icon: 'bg-summary-blue-icon text-summary-blue-icon-text',
    value: 'text-summary-blue-value',
    chip: 'text-summary-blue-chip',
  },
  purple: {
    surface: 'bg-summary-purple-surface',
    icon: 'bg-summary-purple-icon text-summary-purple-icon-text',
    value: 'text-summary-purple-value',
    chip: 'text-summary-purple-chip',
  },
  mint: {
    surface: 'bg-summary-mint-surface',
    icon: 'bg-summary-mint-icon text-summary-mint-icon-text',
    value: 'text-summary-mint-value',
    chip: 'text-summary-mint-chip',
  },
  rose: {
    surface: 'bg-summary-rose-surface',
    icon: 'bg-summary-rose-icon text-summary-rose-icon-text',
    value: 'text-summary-rose-value',
    chip: 'text-summary-rose-chip',
  },
  amber: {
    surface: 'bg-summary-amber-surface',
    icon: 'bg-summary-amber-icon text-summary-amber-icon-text',
    value: 'text-summary-amber-value',
    chip: 'text-summary-amber-chip',
  },
  cyan: {
    surface: 'bg-summary-cyan-surface',
    icon: 'bg-summary-cyan-icon text-summary-cyan-icon-text',
    value: 'text-summary-cyan-value',
    chip: 'text-summary-cyan-chip',
  },
  lime: {
    surface: 'bg-summary-lime-surface',
    icon: 'bg-summary-lime-icon text-summary-lime-icon-text',
    value: 'text-summary-lime-value',
    chip: 'text-summary-lime-chip',
  },
  peach: {
    surface: 'bg-summary-peach-surface',
    icon: 'bg-summary-peach-icon text-summary-peach-icon-text',
    value: 'text-summary-peach-value',
    chip: 'text-summary-peach-chip',
  },
  indigo: {
    surface: 'bg-summary-indigo-surface',
    icon: 'bg-summary-indigo-icon text-summary-indigo-icon-text',
    value: 'text-summary-indigo-value',
    chip: 'text-summary-indigo-chip',
  },
  slate: {
    surface: 'bg-summary-slate-surface',
    icon: 'bg-summary-slate-icon text-summary-slate-icon-text',
    value: 'text-summary-slate-value',
    chip: 'text-summary-slate-chip',
  },
  orchid: {
    surface: 'bg-summary-orchid-surface',
    icon: 'bg-summary-orchid-icon text-summary-orchid-icon-text',
    value: 'text-summary-orchid-value',
    chip: 'text-summary-orchid-chip',
  },
}

export interface SummaryTileMetric {
  label: string
  value: string | number
}

export interface SummaryTileProps {
  title: string
  eyebrow?: string
  value: string | number
  unit?: string
  icon: ReactNode
  tone?: SummaryTileTone
  metrics?: SummaryTileMetric[]
  /** 좁은 타일을 한 줄에 여러 개 배치할 때 쓰는 저밀도 표현. */
  compact?: boolean
  className?: string
}

/**
 * 범주형 현황 요약 카드. 상태 경고가 아니라 서로 다른 업무 영역을 빠르게 스캔하는 데 사용한다.
 * 파스텔 표면, 컬러 아이콘 상자, 강조 수치, 보조 지표 필을 한 세트로 유지한다.
 */
export function SummaryTile({
  title,
  eyebrow,
  value,
  unit,
  icon,
  tone = 'blue',
  metrics = [],
  compact = false,
  className,
}: SummaryTileProps) {
  const colors = toneClass[tone]
  const primary = tone === 'primary'
  return (
    <section className={cn('relative overflow-hidden rounded-radius-lg', compact ? 'p-3' : 'p-4', colors.surface, className)}>
      <div className="relative flex items-start justify-between gap-3">
        <div>
          {eyebrow && <p className={cn('text-caption font-medium tracking-wide', primary ? 'text-white/70' : 'text-gray-600')}>{eyebrow}</p>}
          <h3 className={cn(eyebrow && 'mt-0.5', 'text-body-lg font-bold', primary ? 'text-white' : 'text-gray-900')}>{title}</h3>
        </div>
        <span className={cn('flex shrink-0 items-center justify-center rounded-radius-md', compact ? 'size-8' : 'size-9', colors.icon)}>
          {icon}
        </span>
      </div>
      <div className={cn('relative flex gap-2', compact ? 'mt-3 flex-col items-start' : 'mt-5 items-end justify-between gap-3')}>
        <p className="flex items-baseline gap-1">
          {/* 값은 사다리의 페이지 제목 단계(24px)에 선다. 이전에는 28px 임의값이었는데, 그 크기는
              타이포 스케일에 없어 화면에서 이 타일만 사다리 밖에 서 있었다. */}
          <span className={cn(compact ? 'text-title-sm' : 'text-title-md', 'font-bold leading-none tabular-nums', colors.value)}>
            {value}
          </span>
          {unit && <span className={cn(compact ? 'text-caption' : 'text-body', primary ? 'text-white/70' : 'text-gray-600')}>{unit}</span>}
        </p>
        {metrics.length > 0 && (
          <div className={cn('flex flex-wrap items-center gap-1.5', !compact && 'justify-end')}>
            {metrics.map((metric) => (
              <span key={`${metric.label}-${metric.value}`} className={cn('text-caption font-semibold tabular-nums', !compact && 'rounded-full px-2 py-1', !compact && (primary ? 'bg-white/15' : 'bg-white/70'), colors.chip)}>
                {metric.label} {metric.value}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
