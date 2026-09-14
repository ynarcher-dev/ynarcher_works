// 게스트 로그인 개방 + 접속 안내 발송
// 요청: { participantIds: string[] }
// 응답: { opened: number, notified: number, failed: number }
//
// 인가는 SECURITY INVOKER RPC(open_program_guest_access)가 담당한다. 발송 대상은 요청 본문이
// 아니라 RPC가 계정에서 읽은 이메일이며, 전화번호나 참여자 원장을 대체 수신처로 쓰지 않는다.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse } from '../_shared/cors.ts'
import { loadProgramTitles } from '../_shared/programLedger.ts'
import type { sendNotification } from '../_shared/notifications.ts'

interface OpenedRow {
  participant_id: string
  program_code: string
  target_name: string
  email: string | null
  account_is_new: boolean
}

export interface InviteHandlerDeps {
  /** 호출자 토큰을 그대로 달아 RLS를 받는 클라이언트. */
  caller: (accessToken: string) => SupabaseClient
  /** 발송기. 주입해 두면 테스트가 바깥으로 나가지 않는다. */
  notify: typeof sendNotification
}

export function createInviteHandler(deps: InviteHandlerDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

    try {
      const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
      if (!token) return jsonResponse({ error: 'unauthorized' }, 401)

      const body = await req.json()
      const ids: string[] = Array.isArray(body?.participantIds)
        ? body.participantIds.map((value: unknown) => String(value)).filter(Boolean)
        : []
      if (ids.length === 0) {
        return jsonResponse({ error: 'invalid_request', message: '대상을 선택하세요.' }, 400)
      }

      const caller = deps.caller(token)
      const { data, error } = await caller.rpc('open_program_guest_access', {
        p_participant_ids: ids,
      })
      if (error) {
        const denied = error.code === '42501'
        return jsonResponse(
          { error: denied ? 'forbidden' : 'open_failed', message: error.message },
          denied ? 403 : 400,
        )
      }

      const rows = (data ?? []) as OpenedRow[]

      const { data: parts } = await caller
        .from('program_participants')
        .select('id, program_id')
        .in('id', rows.map((row) => row.participant_id))
      const partProgram = new Map<string, string>(
        ((parts ?? []) as { id: string; program_id: string }[])
          .map((part) => [part.id, part.program_id]),
      )
      const titles = await loadProgramTitles(caller, [...new Set([...partProgram.values()])])

      let notified = 0
      let failed = 0
      for (const row of rows) {
        const email = row.email?.trim() ?? ''
        if (!email) {
          failed += 1
          continue
        }
        const programId = partProgram.get(row.participant_id) ?? ''
        try {
          const result = await deps.notify({
            channel: 'EMAIL',
            to: email,
            // 처음 생성된 계정만 개시 문안을 받는다. 이미 개인 비밀번호를 정한 계정에는
            // 같은 고정 개시 비밀번호가 더 이상 통하지 않는다.
            templateCode: row.account_is_new ? 'GUEST_INVITE_NEW' : 'GUEST_INVITE_ADD',
            variables: {
              name: row.target_name,
              program: titles.get(programId) ?? '참여 프로젝트',
              code: row.program_code,
            },
          })
          if (result.ok) notified += 1
          else failed += 1
        } catch (_error) {
          // 안내 실패가 이미 인가된 접근 개방을 되돌리지는 않는다.
          failed += 1
        }
      }

      return jsonResponse({ opened: rows.length, notified, failed })
    } catch (_error) {
      return jsonResponse({ error: 'internal_error' }, 500)
    }
  }
}
