// 게스트 비밀번호 설정·변경. 판정은 handler.ts에 있다(배선만 남긴 이유는 그 파일 머리글에).
import { withCors } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { createPasswordHandler } from './handler.ts'

Deno.serve(withCors(createPasswordHandler(supabaseAdmin)))
