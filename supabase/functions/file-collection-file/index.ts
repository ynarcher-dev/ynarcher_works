// '파일받기' 모듈 파일 입출구의 실행 엔트리. 판정은 전부 handler.ts에 있고, 여기서는
// 실제 배선(환경 변수로 만든 클라이언트와 공용 게스트 세션 검증)만 끼운다.
//
// 배선을 분리해 둔 이유는 테스트가 같은 순서를 대역으로 지나게 하기 위해서다 —
// 이 파일은 Deno API에 닿으므로 vitest가 불러오지 못하고, 불러올 필요도 없다.
//
// 계약은 material-download와 같다: 호출자 토큰은 Authorization 헤더로 오고, 대상 행
// 조회와 RPC는 anon 키 + 그 토큰으로 던져 RLS를 그대로 받는다. service_role은 Storage
// 서명·신원 lookup·access_logs 적재에만 쓴다.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withCors } from '../_shared/cors.ts'
import { verifyGuestSession } from '../_shared/guestSession.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { createFileCollectionHandler } from './handler.ts'

Deno.serve(
  withCors(
    createFileCollectionHandler({
      admin: () => supabaseAdmin(),
      asCaller: (token: string) =>
        createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          },
        ),
      verifyGuestSession,
    }),
  ),
)
