import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/auth/authStore'

/**
 * 로그인한 본인의 프로필 사진(users.profile.photo, 2MB 이하 data URL).
 *
 * 상단바처럼 **모든 화면에 상시 떠 있는 자리**를 위한 좁은 조회다 — 임직원 단건 훅
 * (`useEmployee`)은 오늘의 유효 배치 맵까지 함께 끌고 오므로 사진 한 장을 얻자고 부르기엔
 * 무겁다. 사진은 자주 바뀌지 않으므로 오래 신선한 것으로 본다(마이페이지에서 바꾸면
 * 다음 진입에 반영된다).
 */
export function useMyPhoto() {
  const userId = useAuthStore((s) => s.user?.id)
  return useQuery({
    queryKey: ['management', 'my-photo', userId],
    enabled: Boolean(userId),
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('users')
        .select('profile')
        .eq('id', userId)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      const photo = (data?.profile as { photo?: unknown } | null)?.photo
      return typeof photo === 'string' && photo ? photo : null
    },
  })
}
