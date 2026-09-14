import { withCors } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { createRefreshHandler } from './handler.ts'

Deno.serve(withCors(createRefreshHandler(supabaseAdmin)))
