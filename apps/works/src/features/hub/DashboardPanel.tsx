import { PersonalPanel } from '@/features/hub/dashboard/PersonalPanel'
import { BusinessOperationsDashboard } from '@/features/hub/dashboard/BusinessOperationsDashboard'
import { NoticeCard } from '@/features/hub/dashboard/NoticeCard'
import { ChecklistCard } from '@/features/hub/dashboard/ChecklistCard'

/**
 * 전사 대시보드(OFFICE 홈). 좌측은 사용자의 사업 운영, 우측은 개인 업무를 보여 준다.
 * 상세 화면들과 같은 컴포지션을 쓴다: 좌측 본문 2/3 + 우측 사이드 1/3(lg 미만에서는 1열).
 */
export function DashboardPanel() {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
      {/* 좌측(2/3): 사업 운영(요약 → 참여 목록) 아래에 공지사항·체크리스트 두 칸.
          아래 두 칸은 운영 조회의 로딩·오류와 무관하게 서야 하므로 형제로 둔다.
          공지사항이 앞자리다 — 전사에서 내려온 소식은 홈에 들어선 순간 먼저 눈에 닿아야 하고,
          체크리스트는 내가 세워 둔 것이라 그다음이다. 퀵 메모는 이 자리에서 걷어 상단바
          진입점(우측 슬라이드오버) 하나로 모았다 — 적고 고치는 자리는 거기 하나면 족하다. */}
      <div className="space-y-4 lg:col-span-2">
        <BusinessOperationsDashboard />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NoticeCard />
          <ChecklistCard />
        </div>
      </div>
      {/* 우측(1/3): 인사말 → 근무체크 → 전자결재. 같은 한 벌이 상단바 '개인 메뉴' 슬라이드오버에도
          그대로 서므로 구성은 PersonalPanel이 소유한다(전자결재는 배치만 잡힌 껍데기 — 건수 더미). */}
      <div className="lg:col-span-1">
        <PersonalPanel />
      </div>
    </div>
  )
}
