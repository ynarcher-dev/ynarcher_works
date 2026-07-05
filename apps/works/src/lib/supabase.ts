import { createClient } from '@supabase/supabase-js'
import { getEnv } from '@/lib/env'

const env = getEnv()

/** 임직원 표준 인증용 Supabase 클라이언트 (표준 JWT 세션 관리). */
export const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
)
