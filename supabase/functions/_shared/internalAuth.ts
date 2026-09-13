import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { supabaseAdmin } from './supabaseAdmin.ts'

const EXTERNAL_ROLES = new Set(['external_startup', 'external_expert', 'temporary_guest'])

/**
 * Supabase Auth 토큰을 활성 내부 앱 사용자로 해석한다.
 * Auth 계정 존재만 확인하면 앱에서 비활성화된 사용자나 외부 계정도 AI 비용을 발생시킬 수
 * 있으므로 public.users의 상태와 역할까지 서버에서 다시 확인한다.
 */
export async function resolveInternalCaller(token: string): Promise<string | null> {
  const admin = supabaseAdmin()
  const { data: authData, error: authError } = await admin.auth.getUser(token)
  if (authError || !authData.user) return null

  const { data: appUser, error: userError } = await admin
    .from('users')
    .select('id, user_type, is_active')
    .eq('auth_user_id', authData.user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (userError || !appUser || !appUser.is_active || EXTERNAL_ROLES.has(String(appUser.user_type))) {
    return null
  }
  return String(appUser.id)
}

/** AI 비용을 발생시키는 OFFICE 쓰기 작업용 인증. 읽기 전용 내부 계정도 여기서는 거부한다. */
export async function resolveOfficeWriter(token: string): Promise<string | null> {
  const appUserId = await resolveInternalCaller(token)
  if (!appUserId) return null
  const admin = supabaseAdmin()
  const { data: user } = await admin.from('users').select('user_type').eq('id', appUserId).maybeSingle()
  if (user?.user_type === 'super_admin') return appUserId

  const { data: permission } = await admin
    .from('workspace_permissions')
    .select('permission_level, expires_at')
    .eq('user_id', appUserId)
    .eq('workspace_key', 'office')
    .maybeSingle()
  if (permission?.permission_level !== 'write') return null
  if (permission.expires_at && new Date(permission.expires_at).getTime() <= Date.now()) return null
  return appUserId
}

/** 호출자 JWT를 그대로 전달해 DB RLS를 적용하는 비특권 클라이언트. */
export function supabaseAsCaller(token: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  )
}
