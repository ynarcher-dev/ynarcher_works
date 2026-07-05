import { useMemo } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { guestSupabase } from '@/lib/supabase'
import { useGuestStore } from '@/auth/guestStore'

/** 현재 게스트 세션 토큰으로 생성한 Supabase 클라이언트(토큰 변경 시에만 재생성). */
export function useGuestClient(): SupabaseClient | null {
  const token = useGuestStore((s) => s.accessToken)
  return useMemo(() => (token ? guestSupabase(token) : null), [token])
}
