import { CalendarClock, CheckCheck, Files, Inbox, Send } from 'lucide-react'
import { Card, SummaryTile, type SummaryTileTone } from '@ynarcher/ui'
import type { LucideIcon } from 'lucide-react'

interface ApprovalSummaryItem {
  key: string
  label: string
  tone: SummaryTileTone
  icon: LucideIcon
}

/** 전자결재 데이터 연동 전 화면 구성을 확인하기 위한 임시 현황판. */
const ITEMS: ApprovalSummaryItem[] = [
  { key: 'all', label: '전체', tone: 'primary', icon: Files },
  { key: 'pending', label: '대기', tone: 'amber', icon: Inbox },
  { key: 'confirm', label: '확인', tone: 'blue', icon: CheckCheck },
  { key: 'planned', label: '예정', tone: 'purple', icon: CalendarClock },
  { key: 'ongoing', label: '진행', tone: 'mint', icon: Send },
]

export function ApprovalSummaryMock() {
  return (
    <Card title="전자결재 현황">
      <section
        aria-label="전자결재 현황 목업"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        {ITEMS.map(({ key, label, tone, icon: Icon }) => (
          <SummaryTile
            key={key}
            title={label}
            value={0}
            unit="건"
            tone={tone}
            icon={<Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          />
        ))}
      </section>
    </Card>
  )
}
