import { Banner, PageHeader } from '@ynarcher/ui'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { AiAgentPanel } from '@/features/hub/AiAgentPanel'
import { BoardWorkspace } from '@/features/hub/BoardWorkspace'
import { useBoardStore } from '@/features/hub/boardStore'
import { CalendarPanel } from '@/features/hub/CalendarPanel'
import { DashboardPanel } from '@/features/hub/DashboardPanel'
import { HubMasterPanel } from '@/features/hub/HubMasterPanel'
import type { HubMasterTabKey } from '@/features/hub/masterConfig'

type HubTab =
  | 'dashboard'
  | 'ai'
  | 'calendar'
  | 'notices'
  | 'files'
  | 'insights'
  | 'managers'
  | 'startups'
  | 'experts'
  | 'orgs'
  | 'ac'
  | 'mna'
  | 'project'
  | 'fund'
  | 'management'

const TITLE: Record<HubTab, string> = {
  dashboard: '대시보드',
  ai: 'AI 에이전트',
  calendar: '전사 캘린더',
  notices: '공지사항',
  files: '자료실',
  insights: '인사이트',
  managers: '임직원 정보',
  startups: '스타트업 네트워크',
  experts: '투자/전문가 네트워크',
  orgs: '협력사 네트워크',
  ac: '사업 현황',
  mna: 'M&A/PE 현황',
  project: '글로벌/신사업 현황',
  fund: '투자현황',
  management: '경영현황',
}

/** 마스터 정보 탭(임직원/스타트업/투자·전문가/협력사) — NETWORKS 동형 표로 조회. */
const MASTER_TABS: HubMasterTabKey[] = ['managers', 'startups', 'experts', 'orgs']
const isMasterTab = (tab: string): tab is HubMasterTabKey =>
  (MASTER_TABS as string[]).includes(tab)

/** HUB 워크스페이스(조회 센터). 섹션 전환은 좌측 사이드바(?tab)가 구동한다. */
export function HubPage() {
  const [params] = useSearchParams()
  const tab = (params.get('tab') as HubTab) ?? 'dashboard'
  const userName = useAuthStore((s) => s.user?.name)
  const boards = useBoardStore((s) => s.boards)

  // 게시판 탭(레지스트리 기준)은 자체 헤더(검색·글쓰기)를 가진 BoardWorkspace가 담당한다.
  const board = boards.find((b) => b.tab === tab && b.active)
  if (board) {
    return (
      <div className="flex h-full flex-col">
        <BoardWorkspace
          key={board.tab}
          boardTab={board.tab}
          title={board.label}
          authorName={userName}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-5">
      {tab !== 'ai' && tab !== 'dashboard' && !isMasterTab(tab) && (
        <PageHeader title={TITLE[tab] ?? '대시보드'} />
      )}

      {tab === 'dashboard' && <DashboardPanel />}
      {tab === 'calendar' && <CalendarPanel />}
      {isMasterTab(tab) && <HubMasterPanel masterKey={tab} />}
      {tab === 'ai' && <AiAgentPanel />}
      {['ac', 'mna', 'project', 'fund', 'management'].includes(tab) && (
        <Banner tone="info">
          {TITLE[tab]} 화면은 RAG/데이터 분석 세부 스펙 확정 후 연결됩니다. (백로그)
        </Banner>
      )}
    </div>
  )
}
