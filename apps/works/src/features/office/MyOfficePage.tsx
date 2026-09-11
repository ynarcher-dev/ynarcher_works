import { Navigate, useSearchParams } from 'react-router-dom'
import { ApprovalWorkspace } from '@/features/approval/ApprovalWorkspace'
import { DashboardPanel } from '@/features/hub/DashboardPanel'

/**
 * 내 오피스: 사용자마다 달라지는 개인 현황과 처리 업무를 모으는 공간.
 * 첫 분리 단계에서는 기존 개인화 대시보드와 전자결재를 소유한다.
 */
export function MyOfficePage() {
  const [params] = useSearchParams()
  const tab = params.get('tab')

  if (!tab) return <Navigate to="/my-office?tab=dashboard" replace />
  if (tab !== 'dashboard' && tab !== 'approval') {
    return <Navigate to="/my-office?tab=dashboard" replace />
  }

  return (
    <div className="flex h-full flex-col gap-5">
      {tab === 'dashboard' && <DashboardPanel />}
      {tab === 'approval' && (
        <ApprovalWorkspace
          initialDocumentId={params.get('doc') ?? undefined}
          initialProgress={params.get('progress') ?? undefined}
          initialBox={params.get('box') ?? undefined}
        />
      )}
    </div>
  )
}
