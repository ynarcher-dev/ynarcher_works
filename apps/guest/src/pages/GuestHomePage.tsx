import { SegmentedToggle } from '@ynarcher/ui'
import { useState } from 'react'
import { GuestButton } from '@/components/GuestButton'
import { guestAuth } from '@/auth/guestAuthService'
import { useGuestStore } from '@/auth/guestStore'
import { ExpertDashboard } from '@/features/ExpertDashboard'
import { StartupDashboard } from '@/features/StartupDashboard'

type View = 'startup' | 'expert'

/** 게스트 홈: 역할(스타트업/전문가)에 따른 대시보드 라우팅 + 역할 전환 스위치. */
export function GuestHomePage() {
  const user = useGuestStore((s) => s.user)
  const program = useGuestStore((s) => s.program)
  // 기본 뷰는 역할 기반. 전문가는 스타트업 뷰로 전환할 수 없으나, 겸직 계정을 위해 스위치 제공.
  const isExpert = user?.role === 'external_expert'
  const [view, setView] = useState<View>(isExpert ? 'expert' : 'startup')

  return (
    <main className="mx-auto max-w-md px-5 pb-16 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-title-md font-bold text-gray-900">
          와이앤아처 <span className="text-brand">GUEST</span>
        </h1>
        <GuestButton variant="outline" onClick={() => guestAuth.signOut()}>
          로그아웃
        </GuestButton>
      </div>
      <p className="mt-1 text-body text-gray-600">
        {user ? `${user.name}님, 환영합니다.` : ''}
      </p>

      {/* 지금 어느 사업으로 들어와 있는지. 세션은 로그인에 쓴 사업 코드에 고정된다. */}
      {program && (
        <div className="mt-3 rounded border border-gray-300 bg-white px-3 py-2">
          <p className="text-body font-medium text-gray-900">{program.title}</p>
        </div>
      )}

      {/* 배타 선택은 손수 만들지 않고 공용 세그먼트 토글을 쓴다. 다만 GUEST의 48px 터치
          규칙(3_9_workspace_guest.md §2)이 밀도 격자보다 우선이라 높이만 얹는다. */}
      {isExpert && (
        <SegmentedToggle
          block
          className="mt-4 h-auto min-h-12"
          label="대시보드 뷰"
          value={view}
          onChange={setView}
          options={[
            { key: 'expert', label: '전문가 뷰' },
            { key: 'startup', label: '스타트업 뷰' },
          ]}
        />
      )}

      <div className="mt-5">
        {view === 'expert' ? <ExpertDashboard /> : <StartupDashboard />}
      </div>
    </main>
  )
}
