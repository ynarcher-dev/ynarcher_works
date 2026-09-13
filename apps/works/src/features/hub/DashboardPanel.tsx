import { PersonalPanel } from '@/features/hub/dashboard/PersonalPanel'
import { BusinessOperationsDashboard } from '@/features/hub/dashboard/BusinessOperationsDashboard'

/**
 * 내 오피스 대시보드. 좌측은 내가 맡은 사업·M&A 프로젝트와 데이터베이스를, 우측은 지금 처리할
 * 개인 업무를 보여 준다. 데스크톱에서는 본문 2/3 + 개인 패널 1/3, 작은 화면에서는 1열이다.
 */
export function DashboardPanel() {
  return (
    <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
      {/* 이전 대시보드에서 쓰던 카드 보드. 사업·딜의 역할별 건수와 내가 기여한 원장 건수를
          한눈에 보여 주고, 각 타일은 해당 워크스페이스의 내 목록으로 연결된다. */}
      <div className="lg:col-span-2">
        <BusinessOperationsDashboard />
      </div>

      {/* 상단바 개인 메뉴와 같은 카드 한 벌. 데스크톱에서는 우측 1/3 열을 유지한다. */}
      <PersonalPanel />
    </div>
  )
}
