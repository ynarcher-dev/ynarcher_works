import { Spinner, cardText, type BadgeTone } from '@ynarcher/ui'
import dayjs from 'dayjs'
import {
  ChevronRight,
  FolderOpen,
  Megaphone,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import aiBannerGraphic from '@/assets/ai_banner_graphic.png'
import { useRightPanel } from '@/app/rightPanel'
import { isNewPost, type BoardPost } from '@/features/hub/boardData'
import { useBoardPosts, useNotices } from '@/features/hub/boardPostsApi'
import { useBoards } from '@/features/hub/boardHooks'
import { useAuthStore } from '@/auth/authStore'
import { useHubSummary, useMyHireDate, type HubSummary } from '@/features/hub/hooks'
import { UnifiedSearchPanel } from '@/features/hub/UnifiedSearchPanel'

/** 입사일 미확인 시 사용할 데모 기준일(와이앤아처 합류 기준). */
const FALLBACK_HIRE_DATE = '2023-03-02'

/** 당해년도 매출 데모 값(원). 전사 매출 소스 확정 시 집계 값으로 교체한다. */
const DEMO_ANNUAL_REVENUE = 8_200_000_000

/** 상단 개인화 인사 카피 — 입사일로부터의 근속 일수(D+n)를 가운데 정렬로 노출. */
function GreetingHeader() {
  const name = useAuthStore((s) => s.user?.name) ?? '동료'
  const { data: hireDate } = useMyHireDate()
  const days =
    dayjs().startOf('day').diff(dayjs(hireDate ?? FALLBACK_HIRE_DATE).startOf('day'), 'day') + 1

  return (
    <div className="text-center">
      {/* 페이지의 h1은 상단 PageHeader('대시보드')가 갖는다. 인사말은 그 아래 위계의 h2로 둔다. */}
      <h2 className="truncate text-title-md font-bold text-gray-900">반갑습니다, {name}님</h2>
      <p className="mt-2 text-body-lg text-gray-600">
        오늘은 와이앤아처와 함께한 지{' '}
        <span className="font-bold tabular-nums text-brand">{days.toLocaleString()}일</span>째 되는
        날입니다.
      </p>
    </div>
  )
}

/** 원화 금액을 억 단위로 축약한다. */
function won(n: number): string {
  return `${(n / 100_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}억`
}

interface InfoCardDef {
  key: string
  label: string
  emoji: string
  tone: BadgeTone
  to: string
  metric: string
  unit?: string
  sub: string
}

/**
 * 요약 지표를 각 메뉴 대표 인포 카드 1장씩으로 변환한다(마스터 4 · 현황 3 · 실적 2).
 * 각 카드는 해당 도메인 워크스페이스로 딥링크하고, 그룹은 색으로 구분한다
 * (마스터=info · 현황=success · 실적=warning).
 */
function buildCards(s: HubSummary): InfoCardDef[] {
  return [
    // 마스터 정보
    {
      key: 'managers',
      label: '임직원 정보',
      emoji: '👥',
      tone: 'info',
      to: '/office?tab=managers',
      metric: String(s.networks.managers),
      unit: '명',
      sub: '전사 임직원 디렉토리',
    },
    {
      key: 'startups',
      label: '스타트업 네트워크',
      emoji: '🚀',
      tone: 'info',
      to: '/startup',
      metric: String(s.networks.startups),
      unit: '개사',
      sub: '포트폴리오 스타트업',
    },
    {
      key: 'experts',
      label: '투자/전문가 네트워크',
      emoji: '🎓',
      tone: 'info',
      to: '/networks?tab=experts',
      metric: String(s.networks.investExperts),
      unit: '건',
      sub: '전문가·BAN·투자사',
    },
    {
      key: 'orgs',
      label: '협력사 네트워크',
      emoji: '🤝',
      tone: 'info',
      to: '/networks?tab=corporates',
      metric: String(s.networks.partners),
      unit: '개사',
      sub: '기관·기업·대학·기타',
    },
    // 현황 정보
    {
      key: 'ac',
      label: '사업 현황',
      emoji: '🎯',
      tone: 'success',
      to: '/ac',
      metric: String(s.ac.operating),
      unit: '개 운영 중',
      sub: `전체 사업 ${s.ac.total}개`,
    },
    {
      key: 'project',
      label: '글로벌/신사업 현황',
      emoji: '📁',
      tone: 'success',
      to: '/project',
      metric: String(s.project.operating),
      unit: '개 진행 중',
      sub: `전체 프로젝트 ${s.project.total}개`,
    },
    {
      key: 'mna',
      label: 'M&A/PE 현황',
      emoji: '💼',
      tone: 'success',
      to: '/mna',
      metric: String(s.mna.operating),
      unit: '건 진행 중',
      sub: `전체 딜 ${s.mna.total}건`,
    },
    // 실적 정보
    {
      key: 'fund',
      label: '투자현황',
      emoji: '💰',
      tone: 'warning',
      to: '/fund',
      metric: won(s.fund.aum),
      unit: 'AUM',
      sub: `총 집행액 ${won(s.fund.drawn)}`,
    },
    {
      key: 'management',
      label: '경영현황',
      emoji: '📊',
      tone: 'warning',
      to: '/management',
      metric: won(DEMO_ANNUAL_REVENUE),
      unit: '매출',
      sub: `${dayjs().year()}년 누적`,
    },
  ]
}

const iconTile: Record<BadgeTone, string> = {
  neutral: 'bg-gray-100 text-gray-600',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  info: 'bg-info-subtle text-info',
  danger: 'bg-danger-subtle text-danger',
}

function InfoCard({ card }: { card: InfoCardDef }) {
  return (
    <Link
      to={card.to}
      className="group flex h-full flex-col gap-3 rounded-radius-md border border-gray-300 bg-gray-0 p-4 shadow-soft transition-all duration-fast hover:border-gray-400 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span
          className={`grid h-10 w-10 place-items-center rounded-radius-md text-xl leading-none ${iconTile[card.tone]}`}
        >
          <span aria-hidden>{card.emoji}</span>
        </span>
        <ChevronRight
          aria-hidden
          className="h-4 w-4 text-gray-400 transition-transform duration-fast group-hover:translate-x-0.5 group-hover:text-gray-600"
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-body font-semibold text-gray-700">{card.label}</p>
        <p className="mt-1 flex min-w-0 items-baseline gap-1">
          <span className="truncate text-title-md font-bold tabular-nums text-gray-900">
            {card.metric}
          </span>
          {card.unit && (
            <span className="shrink-0 whitespace-nowrap text-caption font-medium text-gray-600">
              {card.unit}
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-caption text-gray-600">{card.sub}</p>
      </div>
    </Link>
  )
}

/** 최근 72시간 내 게시글 표시 뱃지. */
export function NewBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-danger-700 px-1 py-px text-tag-table font-bold uppercase tracking-wide text-gray-0">
      NEW
    </span>
  )
}

/** 우측 컬럼 게시판 카드 — 제목 · 작성자 · 날짜 한 줄. */
function BoardCard({
  title,
  icon: Icon,
  tab,
  posts,
}: {
  title: string
  icon: LucideIcon
  tab: string
  posts: BoardPost[]
}) {
  return (
    <section className="flex h-full flex-1 flex-col rounded-radius-md border border-gray-300 bg-gray-0 shadow-soft">
      <header className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-2.5">
        <span className="flex items-center gap-2">
          <Icon aria-hidden className="h-4 w-4 text-gray-500" strokeWidth={1.8} />
          <h3 className={cardText.title}>{title}</h3>
        </span>
        <Link
          to={`/office?tab=${tab}`}
          className="text-caption font-medium text-gray-600 transition-colors duration-fast hover:text-brand"
        >
          더보기
        </Link>
      </header>
      <ul className="flex flex-1 flex-col divide-y divide-gray-50">
        {posts.map((p) => (
          <li
            key={p.id}
            className="grid flex-1 grid-cols-[minmax(0,1fr)_6rem_5.5rem] items-center gap-2 px-4 py-2"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-body text-gray-800">{p.title}</span>
              {isNewPost(p.date) && <NewBadge />}
            </span>
            <span className="truncate text-right text-caption text-gray-600">{p.author}</span>
            <span className="text-right tabular-nums text-caption text-gray-600">{p.date}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PromoBanner() {
  // AI 에이전트는 페이지가 아니라 상단바 전역 진입점(우측 슬라이드오버)에서 연다.
  const { open } = useRightPanel()
  return (
    <button
      type="button"
      onClick={() => open('ai')}
      className="group flex h-20 w-full items-center gap-4 overflow-hidden rounded-radius-md border border-gray-300 bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 pl-5 pr-4 text-left shadow-soft transition-all duration-fast hover:border-brand hover:shadow-md"
    >
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-caption font-semibold text-brand">
            <Sparkles aria-hidden className="h-3 w-3" strokeWidth={2.2} />
            AI AGENT
          </span>
          <h3 className="min-w-0 truncate text-body font-bold text-gray-900">
            AI 스마트 검색 &amp; 분석 에이전트
          </h3>
        </div>
        <p className="mt-0.5 hidden max-w-lg truncate text-caption text-gray-600 xl:block">
          자연어로 복잡한 스타트업 데이터와 M&amp;A 동향을 질문하고, 스마트한 요약 리포트와 분석 딥링크를 즉시 받아보세요.
        </p>
      </div>
      <span className="hidden shrink-0 items-center gap-1 rounded-radius-md bg-brand px-3 py-1.5 text-caption font-medium text-gray-0 transition-transform duration-fast group-hover:translate-x-0.5 sm:inline-flex">
        AI 에이전트 시작하기
        <ChevronRight aria-hidden className="h-3.5 w-3.5" />
      </span>
      <img
        src={aiBannerGraphic}
        alt=""
        className="h-16 w-24 shrink-0 object-contain transition-transform duration-fast group-hover:scale-105"
      />
    </button>
  )
}

/**
 * 전사 대시보드(OFFICE 홈) — 상단 통합검색 + 좌측 워크스페이스 인포(메뉴별 대표 지표 1장씩) +
 * 우측 공지사항/자료실 게시판. 스크롤 없이 한 화면에 담는다.
 * 근거: 3_1_workspace_hub.md §1.1 통합검색 / §1.5 공지·자료 / §1.6 도메인 요약
 */
export function DashboardPanel() {
  const summary = useHubSummary()
  const cards = summary.data ? buildCards(summary.data) : []
  // 우측 게시판 카드: 전체 공지 상위 몇 건 + 공용자료실(첫 자료실 게시판) 최근 자료.
  const { data: notices = [] } = useNotices()
  const boards = useBoards().data ?? []
  const filesBoard = boards.find((b) => b.slug === 'files') ?? boards.find((b) => b.kind === 'ARCHIVE')
  const { data: filePosts = [] } = useBoardPosts(filesBoard?.id)

  return (
    <div>
      <div className="pb-5 pt-0">
        <GreetingHeader />
      </div>

      <UnifiedSearchPanel />

      <div className="mt-6 grid items-stretch gap-5 lg:grid-cols-3">
        {/* 좌: 워크스페이스 인포 */}
        <div className="flex flex-col gap-3 lg:col-span-2">
          <h2 className="text-title-sm font-semibold text-gray-900">오늘까지 와이앤아처는</h2>
          {summary.isLoading ? (
            <Spinner />
          ) : (
            <div className="grid flex-1 gap-3 sm:auto-rows-fr sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((c) => (
                <InfoCard key={c.key} card={c} />
              ))}
            </div>
          )}
        </div>

        {/* 우: 공유 게시판(공지 / 자료) */}
        <div className="flex flex-col gap-3">
          <h2 className="text-title-sm font-semibold text-gray-900">알립니다</h2>
          <div className="flex flex-1 flex-col gap-3">
            <BoardCard
              title="공지사항"
              icon={Megaphone}
              tab="notices"
              posts={notices.slice(0, 5).map((n) => n.post)}
            />
            <BoardCard
              title="공용자료실"
              icon={FolderOpen}
              tab={filesBoard?.slug ?? 'files'}
              posts={filePosts.slice(0, 5)}
            />
          </div>
        </div>
      </div>

      <div className="mt-5">
        <PromoBanner />
      </div>
    </div>
  )
}
