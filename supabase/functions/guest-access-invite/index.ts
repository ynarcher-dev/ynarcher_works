import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withCors } from '../_shared/cors.ts'
import { sendNotification } from '../_shared/notifications.ts'
import { createInviteHandler } from './handler.ts'

Deno.serve(withCors(createInviteHandler({
  caller: (token) => createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  ),
  notify: sendNotification,
})))
