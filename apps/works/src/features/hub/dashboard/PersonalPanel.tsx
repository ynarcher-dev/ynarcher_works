import { ApprovalCard } from '@/features/hub/dashboard/ApprovalCard'
import { WelcomeCard } from '@/features/hub/dashboard/WelcomeCard'
import { WorkCheckCard } from '@/features/hub/dashboard/WorkCheckCard'

/**
 * 개인 메뉴 — 인사말 → 근무체크 → 전자결재 세 칸을 세로로 세운 "나에 관한" 열.
 *
 * 두 자리가 같은 것을 보여 준다: OFFICE 대시보드의 우측 열과 상단바 전역 진입점의 우측
 * 슬라이드오버(RightPanelHost). **한 벌을 두 자리가 나눠 쓰는 것이 이 파일의 존재 이유**이며,
 * 카드를 늘리거나 순서를 바꿀 때 여기만 고치면 두 자리가 함께 따라온다.
 *
 * 슬라이드오버 폭은 2:1 레이아웃의 "1" 트랙에 맞춰져 있어(SlideOver DEFAULT_WIDTH) 대시보드
 * 우측 열과 같은 폭에서 렌더된다 — 카드 내부 규격을 자리별로 나눌 필요가 없다.
 */
export function PersonalPanel({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="space-y-4">
      <WelcomeCard onNavigate={onNavigate} />
      <WorkCheckCard />
      <ApprovalCard onNavigate={onNavigate} />
    </div>
  )
}
