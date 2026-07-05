import { Banner } from '@ynarcher/ui'
import { useState } from 'react'
import { CalendarPanel } from '@/features/hub/CalendarPanel'
import { EmployeeDirectoryPanel } from '@/features/hub/EmployeeDirectoryPanel'
import { UnifiedSearchPanel } from '@/features/hub/UnifiedSearchPanel'

type HubTab = 'search' | 'ai' | 'calendar' | 'ranking' | 'directory'

const TABS: { key: HubTab; label: string }[] = [
  { key: 'search', label: '통합 검색' },
  { key: 'ai', label: 'AI 검색' },
  { key: 'calendar', label: '전사 캘린더' },
  { key: 'ranking', label: '전문가 랭킹' },
  { key: 'directory', label: '임직원 디렉토리' },
]

/** HUB 워크스페이스(조회 센터): 통합검색/AI/캘린더/랭킹/디렉토리. */
export function HubPage() {
  const [tab, setTab] = useState<HubTab>('search')

  return (
    <div className="space-y-5">
      <h1 className="text-title-lg font-bold text-gray-900">HUB</h1>

      <nav className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? 'border-b-2 border-brand px-3 py-2 text-body font-medium text-brand'
                : 'px-3 py-2 text-body text-gray-500 hover:text-gray-800'
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'search' && <UnifiedSearchPanel />}
      {tab === 'calendar' && <CalendarPanel />}
      {tab === 'directory' && <EmployeeDirectoryPanel />}
      {tab === 'ai' && (
        <Banner tone="info">
          AI 검색(Gemini API 연동)은 RAG/Text-to-SQL 방식 확정 후 연결됩니다. (백로그)
        </Banner>
      )}
      {tab === 'ranking' && (
        <Banner tone="info">
          전문가 만족도 랭킹은 `mentor_satisfaction_records` 테이블(AC Phase) 도입 후 집계됩니다.
        </Banner>
      )}
    </div>
  )
}
