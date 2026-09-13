// 게스트 비밀번호 재설정. 판정은 handler.ts에 있다(배선만 남긴 이유는 그 파일 머리글에).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withCors } from '../_shared/cors.ts'
import { sendNotification } from '../_shared/notifications.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { createResetHandler } from './handler.ts'

Deno.serve(withCors(createResetHandler({
  admin: supabaseAdmin,
  // 호출자 권한으로 동작하는 클라이언트(RLS 적용). 익명 키 + 호출자 토큰이라
  // 인가 RPC가 SECURITY INVOKER로 그대로 판정한다.
  caller: (accessToken: string) =>
    createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      },
    ),
  notify: sendNotification,
})))
