import { CalendarClock, CheckCheck, Files, Inbox, Send } from 'lucide-react'
import { Card, SummaryTile, type SummaryTileTone } from '@ynarcher/ui'
import type { LucideIcon } from 'lucide-react'
import type { ApprovalProgressKey } from '@/features/approval/config'

interface TileDef {
  key: ApprovalProgressKey
  label: string
  tone: SummaryTileTone
  icon: LucideIcon
}

/** 하이웍스 '진행 중인 문서' 그룹(전체/대기/확인/예정/진행)을 타일 필터로 승계한다. */
const TILES: TileDef[] = [
  { key: 'all', label: '전체', tone: 'primary', icon: Files },
  { key: 'waiting', label: '대기', tone: 'amber', icon: Inbox },
  { key: 'confirm', label: '확인', tone: 'blue', icon: CheckCheck },
  { key: 'upcoming', label: '예정', tone: 'purple', icon: CalendarClock },
  { key: 'ongoing', label: '진행', tone: 'mint', icon: Send },
]

interface ApprovalSummaryTilesProps {
  counts: Record<ApprovalProgressKey, number>
  /** 켜져 있는 타일 필터(없으면 null). 같은 타일을 다시 누르면 해제된다. */
  selected: ApprovalProgressKey | null
  onSelect: (key: ApprovalProgressKey | null) => void
}

/**
 * 진행 중 문서 현황판이자 필터 — 건수를 세어 놓고 누를 수 없으면 다음에 할 일이
 * 표를 눈으로 훑는 일뿐이라, 타일이 곧 필터다(SummaryTile onClick/selected 규약).
 */
export function ApprovalSummaryTiles({ counts, selected, onSelect }: ApprovalSummaryTilesProps) {
  return (
    <Card title="진행 중인 문서">
      <section
        aria-label="진행 중인 문서 현황"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        {TILES.map(({ key, label, tone, icon: Icon }) => (
          <SummaryTile
            key={key}
            title={label}
            value={counts[key] ?? 0}
            unit="건"
            tone={tone}
            icon={<Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />}
            selected={selected === key}
            onClick={() => onSelect(selected === key ? null : key)}
          />
        ))}
      </section>
    </Card>
  )
}
