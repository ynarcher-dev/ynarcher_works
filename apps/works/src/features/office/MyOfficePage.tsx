import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ApprovalWorkspace } from '@/features/approval/ApprovalWorkspace'
import { workRequestKindOf } from '@/features/approval/workRequestForm'
import { DashboardPanel } from '@/features/hub/DashboardPanel'
import { MyAttendanceWorkspace } from '@/features/management/attendance/MyAttendanceWorkspace'
import { attendanceViewOf } from '@/features/management/attendance/attendanceViews'
import { LeaveRequestEditor } from '@/features/management/attendance/leave/LeaveRequestEditor'
import { WorkRequestEditor } from '@/features/management/attendance/request/WorkRequestEditor'

/**
 * 내 오피스: 사용자마다 달라지는 개인 현황과 처리 업무를 모으는 공간.
 * 첫 분리 단계에서는 기존 개인화 대시보드와 전자결재를 소유한다.
 */
export function MyOfficePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab = params.get('tab')

  /*
    신청 화면은 근태현황 **안에서 열리는 화면**이다(`?tab=attendance&request=leave|overtime|holiday`).
    탭을 더 두지 않는 이유는 이것이 근태현황의 다섯 탭과 나란한 볼거리가 아니라 그 화면에서
    시작하는 한 번의 일이기 때문이다 — 끝나면 문서로 나가고, 돌아올 자리는 근태현황이다.

    `leave=new`는 휴가 신청이 처음 섰을 때의 주소다. 이미 나간 링크와 북마크가 있으므로 계속 받는다.
  */
  const requestParam = params.get('request') ?? (params.get('leave') === 'new' ? 'leave' : null)
  const workRequestKind = workRequestKindOf(requestParam)
  const view = attendanceViewOf(params.get('view'))

  if (!tab) return <Navigate to="/my-office?tab=dashboard" replace />
  if (tab !== 'dashboard' && tab !== 'approval' && tab !== 'attendance') {
    return <Navigate to="/my-office?tab=dashboard" replace />
  }

  const backToAttendance = () => navigate(`/my-office?tab=attendance&view=${view}`)
  const openDocument = (id: string) => navigate(`/my-office?tab=approval&doc=${id}`)

  return (
    <div className="flex h-full flex-col gap-5">
      {tab === 'dashboard' && <DashboardPanel />}
      {/*
        근태현황은 **사이드바에 줄을 두지 않는다**(2026-09-15 사용자 확정). 들어오는 문은
        대시보드 근무체크 카드의 `근태현황` 버튼 하나뿐이다 — 오늘을 찍는 자리에서 "그래서
        올해는 어땠나"로 이어지는 동선이고, 메뉴에 한 줄을 더하면 하루에 한 번 볼 화면이
        늘 보이는 자리를 차지한다. 주소는 살아 있으므로 링크로 공유하거나 북마크할 수 있다.
      */}
      {tab === 'attendance' &&
        (requestParam === 'leave' ? (
          <LeaveRequestEditor onCancel={backToAttendance} onSaved={openDocument} />
        ) : workRequestKind ? (
          <WorkRequestEditor
            kind={workRequestKind}
            onCancel={backToAttendance}
            onSaved={openDocument}
          />
        ) : (
          <MyAttendanceWorkspace
            view={view}
            onViewChange={(next) => navigate(`/my-office?tab=attendance&view=${next}`)}
            onRequest={(kind) =>
              navigate(`/my-office?tab=attendance&view=${view}&request=${kind}`)
            }
          />
        ))}
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
