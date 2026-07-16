// [AC 모집] 공개 신청서 조회(익명). 배포 URL(/apply/:token) 랜딩 렌더용.
// 요청: { token }
// 응답: { title, landing, fields[] } | 403 not_open | 404 not_found
//
// 보안:
// - 공개 상태(public_status='OPEN')이고 공개 기간(open_at~close_at) 내인 신청서만 반환한다.
//   PRIVATE/CLOSED, 기간 전/후는 403(사유 reason과 함께).
// - service_role로 조회하되 공개 화이트리스트 컬럼만 반환한다(내부 데이터·접수 목록 미노출).
// - 개인정보를 반환하지 않는다(폼 정의만). 인증 불필요(익명 신청자 대상).
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { windowState } from '../_shared/recruitmentWindow.ts'

interface FieldRow {
  id: string
  field_type: string
  label: string
  is_required: boolean
  options: unknown
  file_constraints: unknown
  sort_order: number
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const token = String(body.token ?? '').trim()
    if (!token) return jsonResponse({ error: 'invalid_request' }, 400)

    const db = supabaseAdmin()
    const { data: form, error } = await db
      .from('application_forms')
      .select(
        'title, public_status, open_at, close_at, landing, ' +
          'fields:application_form_fields(id, field_type, label, is_required, options, file_constraints, sort_order)',
      )
      .eq('public_token', token)
      .maybeSingle()

    if (error) return jsonResponse({ error: 'internal_error' }, 500)
    if (!form) return jsonResponse({ error: 'not_found' }, 404)

    // 공개 상태 + 공개 기간(타이머)을 서버가 authoritative하게 판정한다.
    const gate = windowState(form.public_status, form.open_at, form.close_at)
    if (gate.reason) {
      return jsonResponse(
        { error: 'not_open', reason: gate.reason, open_at: form.open_at, close_at: form.close_at },
        403,
      )
    }

    const fields = ((form.fields as FieldRow[] | null) ?? []).sort(
      (a, b) => a.sort_order - b.sort_order,
    )
    return jsonResponse({
      title: form.title,
      landing: form.landing ?? {},
      fields,
      open_at: form.open_at,
      close_at: form.close_at,
    })
  } catch (_e) {
    return jsonResponse({ error: 'internal_error' }, 500)
  }
}))
