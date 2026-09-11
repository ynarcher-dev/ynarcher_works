import { PersonalPanel } from '@/features/hub/dashboard/PersonalPanel'

/**
 * 내 오피스 대시보드. 개인 프로필·근무체크·전자결재처럼 지금 처리할 개인 업무만 보여 준다.
 * KPI와 공지사항은 각 소유 화면에서 확인하므로 이 개인 홈에서는 중복 노출하지 않는다.
 */
export function DashboardPanel() {
  return (
    <div className="max-w-xl">
      {/* 상단바 개인 메뉴와 같은 카드 한 벌을 쓰되, 넓은 본문에서 카드가 과도하게 늘어나지 않게
          종전 우측 열과 비슷한 폭을 유지한다. */}
      <PersonalPanel />
    </div>
  )
}
