import { CardShell } from '@ynarcher/ui'
import { PersonalPanel } from '@/features/hub/dashboard/PersonalPanel'

/**
 * 내 오피스 대시보드. 개인 프로필·근무체크·전자결재처럼 지금 처리할 개인 업무만 보여 준다.
 * KPI와 공지사항이 빠진 좌측은 후속 콘텐츠를 위한 빈 블록으로 두고, 개인 패널은 우측 열을 지킨다.
 */
export function DashboardPanel() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* 이후 내 오피스 콘텐츠가 들어올 자리. 우측 개인 패널의 위치가 흔들리지 않도록
          데스크톱에서는 종전 본문 폭(2/3)을 그대로 점유한다. */}
      <CardShell as="div" className="min-h-64 lg:col-span-2 lg:min-h-0">
        {null}
      </CardShell>

      {/* 상단바 개인 메뉴와 같은 카드 한 벌. 종전 우측 1/3 열을 그대로 유지한다. */}
      <PersonalPanel />
    </div>
  )
}
