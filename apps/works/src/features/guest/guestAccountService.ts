import { supabase } from '@/lib/supabase'
import type { MasterTable } from '@/features/program/participantPersona'

/**
 * GUEST 계정 생성의 단일 프론트엔드 진입점.
 *
 * 통합 GUEST 원장에서 직접 만드는 계정과 각 워크스페이스가 참가자에게 만드는 계정이 모두
 * 같은 RPC를 지난다. 원장을 고르면 그 인격까지 함께 연결하고, 고르지 않으면 임시 GUEST
 * 계정만 만든다. 어느 화면도 users·guest_credentials·guest_identities를 직접 쓰지 않는다.
 */
export interface CreateGuestAccountInput {
  name: string
  email: string
  phone: string
  masterTable?: MasterTable | null
  masterId?: string | null
}

export async function createGuestAccount(input: CreateGuestAccountInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_guest_account', {
    p_name: input.name.trim(),
    p_email: input.email.trim(),
    p_phone: input.phone.trim(),
    p_master_table: input.masterTable ?? null,
    p_master_id: input.masterId ?? null,
  })
  if (error) throw error
  return data as string
}
