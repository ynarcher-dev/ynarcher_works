import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { GuestAccountCreateModal } from '@/features/guest/GuestAccountCreateModal'

/**
 * GUEST 계정 파일 업로드 전용 페이지(`/guest-accounts/bulk`).
 *
 * 수기 생성과 파일 업로드는 진입점만 나눈다. 행 검증·부분 성공·실패 줄 재시도는 같은 편집기를
 * 사용해 두 화면의 판정이 갈리지 않게 한다.
 */
export function GuestAccountsBulkPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((state) => state.user)

  return (
    <GuestAccountCreateModal
      open
      presentation="bulk-page"
      user={user}
      onClose={() => navigate('/guest-accounts', { state: location.state })}
    />
  )
}
