import { Banner, Button, Input, Modal, PageHeader } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { AiAgentPanel } from '@/features/hub/AiAgentPanel'
import { BoardPanel } from '@/features/hub/BoardPanel'
import {
  HUB_FILES,
  HUB_INSIGHTS,
  HUB_NOTICES,
  type BoardPost,
} from '@/features/hub/boardData'
import { CalendarPanel } from '@/features/hub/CalendarPanel'
import { DashboardPanel } from '@/features/hub/DashboardPanel'
import { EmployeeDirectoryPanel } from '@/features/hub/EmployeeDirectoryPanel'
import { RankingPanel } from '@/features/hub/RankingPanel'

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
  | 'partners'
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
  managers: '심사역 정보',
  startups: '스타트업 정보',
  experts: '전문가 정보',
  partners: '협력사 정보',
  ac: '사업 현황',
  mna: 'M&A 현황',
  project: '프로젝트 현황',
  fund: '투자현황',
  management: '경영현황',
}

/** 게시판형(공지사항·자료실·인사이트) 탭별 데이터 원천. */
const BOARD_POSTS: Partial<Record<HubTab, BoardPost[]>> = {
  notices: HUB_NOTICES,
  files: HUB_FILES,
  insights: HUB_INSIGHTS,
}

/** 제목·작성자에 검색어(공백 무시, 대소문자 무시)가 포함된 게시글만 남긴다. */
function filterPosts(posts: BoardPost[], keyword: string): BoardPost[] {
  const q = keyword.trim().toLowerCase()
  if (!q) return posts
  return posts.filter((p) => `${p.title} ${p.author}`.toLowerCase().includes(q))
}

/** HUB 워크스페이스(조회 센터). 섹션 전환은 좌측 사이드바(?tab)가 구동한다. */
export function HubPage() {
  const [params] = useSearchParams()
  const tab = (params.get('tab') as HubTab) ?? 'dashboard'
  const userName = useAuthStore((s) => s.user?.name)

  // 게시판 탭 검색어. 탭 전환 시 초기화한다.
  const [keyword, setKeyword] = useState('')
  // 데모 로컬 작성분(탭별). 새로고침 시 초기화된다.
  const [drafts, setDrafts] = useState<Partial<Record<HubTab, BoardPost[]>>>({})
  // 글쓰기 모달 상태와 입력값.
  const [composing, setComposing] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')

  useEffect(() => {
    setKeyword('')
    setComposing(false)
    setDraftTitle('')
  }, [tab])

  const boardPosts = BOARD_POSTS[tab]
  const isBoard = boardPosts !== undefined
  const posts = boardPosts
    ? [...(drafts[tab] ?? []), ...boardPosts]
    : undefined

  const submitDraft = () => {
    const title = draftTitle.trim()
    if (!title || !isBoard) return
    const post: BoardPost = {
      id: `local-${Date.now()}`,
      title,
      author: userName ?? '작성자',
      date: dayjs().format('YYYY.MM.DD'),
    }
    setDrafts((prev) => ({ ...prev, [tab]: [post, ...(prev[tab] ?? [])] }))
    setDraftTitle('')
    setComposing(false)
  }

  const search = isBoard ? (
    <Input
      placeholder="제목·작성자 검색"
      value={keyword}
      onChange={(e) => setKeyword(e.target.value)}
    />
  ) : undefined

  const actions = isBoard ? (
    <Button onClick={() => setComposing(true)}>글쓰기</Button>
  ) : undefined

  return (
    <div className="flex h-full flex-col gap-5">
      {tab !== 'ai' && tab !== 'dashboard' && (
        <PageHeader title={TITLE[tab] ?? '대시보드'} search={search} actions={actions} />
      )}

      {tab === 'dashboard' && <DashboardPanel />}
      {tab === 'calendar' && <CalendarPanel />}
      {tab === 'managers' && <EmployeeDirectoryPanel />}
      {tab === 'experts' && <RankingPanel />}
      {tab === 'ai' && <AiAgentPanel />}
      {posts && (
        <BoardPanel
          posts={filterPosts(posts, keyword)}
          emptyText={
            keyword.trim() ? '검색 결과가 없습니다.' : '등록된 게시글이 없습니다.'
          }
        />
      )}
      {['startups', 'partners', 'ac', 'mna', 'project', 'fund', 'management'].includes(tab) && (
        <Banner tone="info">
          {TITLE[tab]} 화면은 RAG/데이터 분석 세부 스펙 확정 후 연결됩니다. (백로그)
        </Banner>
      )}

      <Modal
        open={composing}
        onClose={() => setComposing(false)}
        title={`${isBoard ? TITLE[tab] : '게시글'} 글쓰기`}
        footer={
          <>
            <Button variant="outline" onClick={() => setComposing(false)}>
              취소
            </Button>
            <Button onClick={submitDraft} disabled={!draftTitle.trim()}>
              등록
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-caption font-semibold text-gray-600">제목</label>
            <Input
              autoFocus
              placeholder="제목을 입력하세요"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitDraft()
              }}
            />
          </div>
          <p className="text-caption text-gray-400">
            작성자({userName ?? '작성자'})와 게시일(오늘)은 자동으로 기록됩니다.
          </p>
        </div>
      </Modal>
    </div>
  )
}
