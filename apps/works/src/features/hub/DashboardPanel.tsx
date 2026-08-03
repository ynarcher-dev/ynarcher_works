import { Card } from '@ynarcher/ui'
import { ApprovalCard } from '@/features/hub/dashboard/ApprovalCard'
import { WelcomeCard } from '@/features/hub/dashboard/WelcomeCard'
import { WorkCheckCard } from '@/features/hub/dashboard/WorkCheckCard'

/** 최근 72시간 내 게시글 표시 뱃지. 대시보드 외 게시판·자료실·회의록 목록이 함께 쓴다. */
export function NewBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-danger-700 px-1 py-px text-tag-table font-bold uppercase tracking-wide text-gray-0">
      NEW
    </span>
  )
}

/** 재설계 중인 대시보드의 빈 슬롯. 들어갈 내용이 정해지면 실제 카드로 교체한다. */
function DashboardSlot({ title }: { title: string }) {
  return (
    <Card title={title} bodyClassName="min-h-40">
      <p className="text-caption text-gray-400">준비 중입니다.</p>
    </Card>
  )
}

/**
 * 전사 대시보드(OFFICE 홈) — 전면 재설계 중, 지금은 2:1 골격만 잡혀 있다.
 * 상세 화면들과 같은 컴포지션을 쓴다: 좌측 본문 2/3 + 우측 사이드 1/3(lg 미만에서는 1열).
 * 각 칸의 실제 내용은 후속 작업에서 채운다. 재사용 가능한 요소는 그대로 남아 있다 —
 * 통합검색은 `@/features/hub/UnifiedSearchPanel`, 도메인 요약 집계는
 * `@/features/hub/hooks`(useHubSummary·useMyHireDate), 게시글 조회는
 * `@/features/hub/boardPostsApi`.
 */
export function DashboardPanel() {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <DashboardSlot title="주요 영역" />
      </div>
      {/* 우측(1/3): 인사말 → 근무체크 → 전자결재. 전자결재는 배치만 잡힌 껍데기다(건수 0 고정). */}
      <div className="space-y-4 lg:col-span-1">
        <WelcomeCard />
        <WorkCheckCard />
        <ApprovalCard />
      </div>
    </div>
  )
}
