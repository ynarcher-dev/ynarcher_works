import { useState } from 'react'
import { guestAuth } from '@/auth/guestAuthService'
import { useGuestStore } from '@/auth/guestStore'
import { ExpertDashboard } from '@/features/ExpertDashboard'
import { StartupDashboard } from '@/features/StartupDashboard'

type View = 'startup' | 'expert'

/** 게스트 홈: 역할(스타트업/전문가)에 따른 대시보드 라우팅 + 역할 전환 스위치. */
export function GuestHomePage() {
  const user = useGuestStore((s) => s.user)
  // 기본 뷰는 역할 기반. 전문가는 스타트업 뷰로 전환할 수 없으나, 겸직 계정을 위해 스위치 제공.
  const isExpert = user?.role === 'external_expert'
  const [view, setView] = useState<View>(isExpert ? 'expert' : 'startup')

  return (
    <main className="mx-auto max-w-md px-5 pb-16 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-title-md font-bold text-gray-900">
          와이앤아처 <span className="text-brand">GUEST</span>
        </h1>
        <button
          type="button"
          onClick={() => guestAuth.signOut()}
          className="min-h-12 rounded border border-gray-300 px-3 text-caption text-gray-700 active:bg-gray-50"
        >
          로그아웃
        </button>
      </div>
      <p className="mt-1 text-body text-gray-600">
        {user ? `${user.name}님, 환영합니다.` : ''}
      </p>

      {isExpert && (
        <div className="mt-4 flex gap-1 rounded-lg bg-gray-100 p-1">
          {(['expert', 'startup'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`min-h-12 flex-1 rounded text-body font-medium ${
                view === v ? 'bg-white text-brand shadow-sm' : 'text-gray-600'
              }`}
            >
              {v === 'expert' ? '전문가' : '스타트업'} 뷰
            </button>
          ))}
        </div>
      )}

      <div className="mt-5">
        {view === 'expert' ? <ExpertDashboard /> : <StartupDashboard />}
      </div>
    </main>
  )
}
