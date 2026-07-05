import { guestAuth } from '@/auth/guestAuthService'
import { useGuestStore } from '@/auth/guestStore'

export function GuestHomePage() {
  const user = useGuestStore((s) => s.user)

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-title-md font-bold text-gray-900">
          와이앤아처 <span className="text-brand">GUEST</span>
        </h1>
        <button
          type="button"
          onClick={() => guestAuth.signOut()}
          className="rounded border border-gray-300 px-3 py-1.5 text-caption text-gray-700 transition-colors duration-fast hover:bg-gray-50"
        >
          로그아웃
        </button>
      </div>
      <p className="mt-2 text-body text-gray-600">
        {user ? `${user.name}님, 환영합니다. (역할: ${user.role})` : ''}
      </p>
      <p className="mt-6 text-body text-gray-500">
        참여 프로그램 일정·예약·평가 화면은 Phase 13(GUEST 앱)에서 구성됩니다.
      </p>
    </main>
  )
}
