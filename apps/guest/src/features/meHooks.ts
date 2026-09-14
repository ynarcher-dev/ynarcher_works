import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { guestAuth, type GuestMe } from '@/auth/guestAuthService'

/**
 * 세션이 지금 무엇인가를 답하는 **단 하나의 질의 키**.
 *
 * 값의 출처는 `guest-auth-refresh` 하나이고 그 안에 계정·맥락·자격·전환 목록이 함께 온다.
 * 키를 한곳에 두는 이유는 화면마다 같은 응답을 따로 받지 않게 하기 위해서다 — 사이드바
 * 전환기·마이페이지·개요 요약이 같은 사실을 보여 주는데 각자 왕복하면 셋이 서로 다른 시점의
 * 값을 그릴 수 있다. 키에 사업 id를 넣지 않는다: 맥락이 바뀌면 값이 아니라 **캐시 자체가**
 * 버려진다(guestAuthService의 `dropContextQueries`).
 */
export const GUEST_ME_KEY = ['guest', 'me'] as const

/**
 * 내 계정과 지금 맥락. 계정 프로필과 현재 참여 상태를 한 응답으로 새로고침한다.
 *
 * 응답이 `null`이면 접근이 닫혔다는 뜻이며(401) 그 자리에서 세션이 비워져 `RequireGuestAuth`가
 * 로그인으로 돌려보낸다. 그 밖의 실패는 `isError`로 남고 세션은 유지된다 — 네트워크가 한 번
 * 끊겼다고 로그인 화면으로 쫓아내지 않는다.
 */
export function useGuestMe(): UseQueryResult<GuestMe | null> {
  return useQuery<GuestMe | null>({
    queryKey: GUEST_ME_KEY,
    queryFn: () => guestAuth.refreshSession(),
  })
}
