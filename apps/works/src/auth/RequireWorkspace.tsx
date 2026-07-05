import type { ReactNode } from 'react'
import { hasWorkspaceRead, useAuthStore } from '@/auth/authStore'
import type { WorkspaceKey } from '@/auth/types'

/**
 * 워크스페이스 접근 가드(역할 기반). 읽기 권한이 없으면 콘텐츠를 렌더링하지 않는다.
 * 최종 보안은 서버 RLS가 강제하며, 본 가드는 UX 목적의 1차 차단이다.
 */
export function RequireWorkspace({
  workspace,
  children,
}: {
  workspace: WorkspaceKey
  children: ReactNode
}) {
  const user = useAuthStore((s) => s.user)
  if (!hasWorkspaceRead(user, workspace)) {
    return (
      <div className="p-6 text-body text-danger">
        해당 워크스페이스에 접근할 권한이 없습니다.
      </div>
    )
  }
  return <>{children}</>
}
