// 게스트 로그인 — 이메일(ID) + 비밀번호. 판정은 handler.ts에 있다.
//
// 이 파일에는 런타임 배선만 남긴다(Deno.serve + service_role 클라이언트). 판정과 배선이
// 한 파일에 있으면 모듈을 여는 순간 서버가 서기 때문에 판정을 테스트에서 부를 수 없다.
import { withCors } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { createLoginHandler } from './handler.ts'

Deno.serve(withCors(createLoginHandler(supabaseAdmin)))
