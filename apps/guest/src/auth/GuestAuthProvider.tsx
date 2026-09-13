import { useEffect, type ReactNode } from 'react'
import { guestAuth } from '@/auth/guestAuthService'
import { useGuestStore } from '@/auth/guestStore'
import { GUEST_ME_KEY } from '@/features/meHooks'
import { queryClient } from '@/lib/queryClient'

/**
 * 앱 구동 시 localStorage 게스트 세션 복원 + 백그라운드 새로고침.
 *
 * 복원만 하면 화면은 로그인 시점의 복사본(이름·사업명)으로 열린다. 복원 직후 원장 값을
 * 되받아 조용히 바로잡는다 — 실패(네트워크 등)해도 세션은 유지한다. 접근이 닫힌 경우(401)는
 * refreshSession이 스스로 로그아웃시킨다.
 *
 * 갱신을 직접 부르지 않고 **질의 캐시를 통해** 부른다(2026-09-13). 이 자리에서만 새로고침하던
 * 종전 구조는 '앱 구동'이라는 한 순간에만 답이 들어오는 구조였다 — 방금 로그인해 들어온
 * 세션에는 이 효과가 다시 돌지 않으므로 전환 목록이 빈 채로 남았고, 참여가 여럿인 사람도
 * 새로고침하기 전까지는 사이드바에서 갈아탈 수 없었다. 같은 키를 사이드바 전환기가 구독하면
 * 로그인 직후든 갈아탄 직후든 화면이 스스로 목록을 다시 받으며, 키가 같으므로 왕복은 한 번이다.
 */
export function GuestAuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    guestAuth.restore()
    if (useGuestStore.getState().status !== 'authenticated') return
    void queryClient
      .fetchQuery({ queryKey: GUEST_ME_KEY, queryFn: () => guestAuth.refreshSession() })
      .catch(() => {})
  }, [])
  return <>{children}</>
}
