import { Banner } from '@ynarcher/ui'
import { useSearchParams } from 'react-router-dom'
import { CalendarPanel } from '@/features/hub/CalendarPanel'
import { EmployeeDirectoryPanel } from '@/features/hub/EmployeeDirectoryPanel'
import { RankingPanel } from '@/features/hub/RankingPanel'
import { UnifiedSearchPanel } from '@/features/hub/UnifiedSearchPanel'

type HubTab = 'search' | 'ai' | 'calendar' | 'ranking' | 'directory'

const TITLE: Record<HubTab, string> = {
  search: '통합 검색',
  ai: 'AI 검색',
  calendar: '전사 캘린더',
  ranking: '전문가 랭킹',
  directory: '임직원 디렉토리',
}

/** HUB 워크스페이스(조회 센터). 섹션 전환은 좌측 사이드바(?tab)가 구동한다. */
export function HubPage() {
  const [params] = useSearchParams()
  const tab = (params.get('tab') as HubTab) ?? 'search'

  return (
    <div className="space-y-5">
      <h1 className="text-title-lg font-bold text-gray-900">
        HUB · {TITLE[tab] ?? '통합 검색'}
      </h1>

      {tab === 'search' && <UnifiedSearchPanel />}
      {tab === 'calendar' && <CalendarPanel />}
      {tab === 'directory' && <EmployeeDirectoryPanel />}
      {tab === 'ranking' && <RankingPanel />}
      {tab === 'ai' && (
        <Banner tone="info">
          AI 검색(Gemini API 연동)은 RAG/Text-to-SQL 방식 확정 후 연결됩니다. (백로그)
        </Banner>
      )}
    </div>
  )
}
