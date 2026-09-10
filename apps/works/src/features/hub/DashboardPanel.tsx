import { PersonalPanel } from '@/features/hub/dashboard/PersonalPanel'
import { KpiDashboard } from '@/features/hub/dashboard/KpiDashboard'
import { NoticeCard } from '@/features/hub/dashboard/NoticeCard'

/**
 * 전사 대시보드(OFFICE 홈). 좌측은 개인·소속 부서 KPI, 우측은 개인 업무를 보여 준다.
 * 상세 화면들과 같은 컴포지션을 쓴다: 좌측 본문 2/3 + 우측 사이드 1/3(lg 미만에서는 1열).
 */
export function DashboardPanel() {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
      {/* 좌측(2/3): 개인 KPI와 소속 부서 KPI 아래에 공지사항 한 칸. KPI 조회의 로딩·오류와
          무관하게 서야 하므로 형제로 둔다. 옆에 서던 체크리스트는 퀵 메모와 함께 걷었으므로
          (2026-09-11) 격자를 두지 않고 공지사항이 그 줄을 그대로 쓴다 — 칸이 하나인 격자는
          같은 자리에 반쪽짜리 카드를 세울 뿐이다. */}
      <div className="space-y-4 lg:col-span-2">
        <KpiDashboard />
        <NoticeCard />
      </div>
      {/* 우측(1/3): 인사말 → 근무체크 → 전자결재. 같은 한 벌이 상단바 '개인 메뉴' 슬라이드오버에도
          그대로 서므로 구성은 PersonalPanel이 소유한다. 전자결재 건수는 문서함 좌패널과 같은
          함수로 세며(model.countByProgress), 각 줄은 그 칸이 켜진 문서함으로 건너간다. */}
      <div className="lg:col-span-1">
        <PersonalPanel />
      </div>
    </div>
  )
}
