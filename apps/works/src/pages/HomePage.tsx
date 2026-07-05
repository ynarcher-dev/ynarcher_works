import { Badge, Button } from '@ynarcher/ui'
import { employeeAuth } from '@/auth/employeeAuthService'
import { useAuthStore } from '@/auth/authStore'

export function HomePage() {
  const user = useAuthStore((s) => s.user)

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-title-lg font-bold text-gray-900">
          와이앤아처 통합 Works — <span className="text-brand">WORKS</span>
        </h1>
        <Button variant="outline" size="sm" onClick={() => void employeeAuth.signOut()}>
          로그아웃
        </Button>
      </div>

      <p className="mt-2 text-body text-gray-600">
        {user
          ? `${user.name}님, 환영합니다. (역할: ${user.role})`
          : '세션 정보를 불러오는 중입니다.'}
      </p>

      <section className="mt-6">
        <h2 className="text-title-sm font-medium text-gray-900">
          접근 가능한 워크스페이스
        </h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {user &&
            Object.entries(user.permissions).map(([key, perm]) => (
              <li key={key}>
                <Badge tone={perm?.level === 'write' ? 'success' : 'info'}>
                  {key.toUpperCase()} · {perm?.level}
                </Badge>
              </li>
            ))}
        </ul>
      </section>
    </main>
  )
}
