import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getEnv } from '@/lib/env'

const env = getEnv()

/**
 * 게스트 데이터 접근용 Supabase 클라이언트.
 * 커스텀 JWT(게스트)를 Authorization 헤더로 주입하여 RLS 판정을 받는다.
 */
export function guestSupabase(accessToken: string): SupabaseClient {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

/** Edge Function 호출 기본 URL/헤더. */
export const functionsBase = `${env.VITE_SUPABASE_URL}/functions/v1`
export const anonHeaders = {
  apikey: env.VITE_SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
}
