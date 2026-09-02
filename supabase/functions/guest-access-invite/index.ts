// 연동 DB — 게스트 로그인 개방 + 접속 안내 발송
// 요청: { participantIds: string[] }
// 응답: { opened: number, notified: number, failed: number }
//
// 보안:
// - 인가는 이 함수가 아니라 RPC(open_program_guest_access)가 진다. 호출자의 토큰을 그대로
//   달아 PostgREST로 보내므로 SECURITY INVOKER + RLS가 그대로 걸리고, 사업 담당자(PM·MEMBER)가
//   아니면 42501로 튕긴다. service_role을 쓰지 않는 이유가 그것이다 — 여기서 관리자 키를 쓰면
//   담당자 판정을 이 함수 안에 복제해야 하고 그 복제본이 곧 권한 구멍이 된다.
// - 발송 대상 연락처는 요청 본문이 아니라 RPC가 원장에서 읽어 돌려준 값이다. 클라이언트가
//   수신처를 정할 수 있으면 남의 초대를 자기 주소로 받을 수 있다.
// 근거: docs/docs_planning/3_4_4_ac_participant_pool.md §6.4, §10
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { loadProgramTitles } from '../_shared/programLedger.ts'
import { sendNotification } from '../_shared/notifications.ts'

interface OpenedRow {
  participant_id: string
  program_code: string
  target_name: string
  email: string | null
  phone: string | null
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return jsonResponse({ error: 'unauthorized' }, 401)

    const body = await req.json()
    const ids: string[] = Array.isArray(body?.participantIds)
      ? body.participantIds.map((v: unknown) => String(v)).filter(Boolean)
      : []
    if (ids.length === 0) {
      return jsonResponse({ error: 'invalid_request', message: '대상을 선택하세요.' }, 400)
    }

    // 호출자 권한으로 동작하는 클라이언트(RLS 적용).
    const caller = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      },
    )

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

    // 안내문에 사업명을 싣기 위한 조회. 실패해도 발송은 코드만으로 성립한다.
    const { data: parts } = await caller
      .from('program_participants')
      .select('id, program_id')
      .in('id', rows.map((r) => r.participant_id))
    const partProgram = new Map<string, string>(
      ((parts ?? []) as { id: string; program_id: string }[]).map((p) => [p.id, p.program_id]),
    )
    const titles = await loadProgramTitles(caller, [...new Set([...partProgram.values()])])

    let notified = 0
    let failed = 0
    for (const row of rows) {
      const to = row.email ?? row.phone ?? ''
      if (!to) {
        failed += 1
        continue
      }
      const programId = partProgram.get(row.participant_id) ?? ''
      try {
        // 디스패처는 프로바이더가 없으면 예외가 아니라 { ok: false }를 돌려준다.
        // 반환값을 보지 않으면 한 통도 나가지 않은 발송이 "보냈습니다"로 집계된다.
        const res = await sendNotification({
          channel: to.includes('@') ? 'EMAIL' : 'ALIMTALK',
          to,
          templateCode: 'GUEST_INVITE',
          variables: {
            name: row.target_name,
            program: titles.get(programId) ?? '참여 사업',
            code: row.program_code,
          },
        })
        if (res.ok) notified += 1
        else failed += 1
      } catch (_e) {
        // 발송 실패가 개방을 되돌리지는 않는다. 담당자가 코드를 직접 안내할 수 있다.
        failed += 1
      }
    }

    return jsonResponse({ opened: rows.length, notified, failed })
  } catch (_e) {
    return jsonResponse({ error: 'internal_error' }, 500)
  }
}))
