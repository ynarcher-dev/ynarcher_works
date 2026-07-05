import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * service_role 클라이언트(RLS 우회). OTP 발급/검증 등 게스트 인증 서버 로직 전용.
 * 사용 목적(게스트 인증) 외 경로에서 사용 금지. (RLS 매트릭스 §2-6)
 */
export function supabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
