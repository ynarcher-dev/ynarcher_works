import { PageHeader } from '@ynarcher/ui'
import { hasWorkspaceWrite, useAuthStore } from '@/auth/authStore'
import { GuestAccountPanel } from '@/features/admin/GuestAccountPanel'

/**
 * 내부 사용자 공용 GUEST 계정 원장.
 *
 * 목록의 실제 시야는 `guest_accounts_list`와 원장 RLS가 정한다. M&A 읽기 권한이 없으면
 * M&A 전용 계정은 계정 자체가 서지 않고, 혼합 계정은 일반 사업 연결만 보인다. 계정 전체를
 * 정지·해제하는 일만 ADMIN 쓰기 권한자에게 남긴다.
 */
export function GuestAccountsPage() {
  const user = useAuthStore((s) => s.user)
  const canAdminister = hasWorkspaceWrite(user, 'admin')

  return (
    <div className="space-y-5">
      <PageHeader title="GUEST 계정 관리" />
      <GuestAccountPanel canAdminister={canAdminister} user={user} />
    </div>
  )
}
