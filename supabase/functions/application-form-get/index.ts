// [AC 모집] 공개 신청서 조회(익명). 배포 URL(/apply/:token) 랜딩 렌더용.
// 요청: { token }
// 응답: { title, landing, fields[] } | 403 not_open | 404 not_found
//
// 보안:
// - 열람 가능 여부는 **모듈 공개 링크와 같은 게이트**가 판정한다(_shared/publicModuleLink.ts,
//   2026-09-02 이관). 종전에는 이 파일이 application_forms의 공개 상태·기간만 보고 판단해,
//   담당자가 모듈을 꺼도 신청서는 계속 열려 있었다. 이제 링크 상태·기간 · 모듈 생존 ·
//   사업 생존 · ADMIN 상한을 한 판정이 함께 본다.
// - service_role로 조회하되 공개 화이트리스트 컬럼만 반환한다(내부 데이터·접수 목록 미노출).
// - 개인정보를 반환하지 않는다(폼 정의만). 인증 불필요(익명 신청자 대상).
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { denyStatus, resolvePublicLink } from '../_shared/publicModuleLink.ts'

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
    const resolved = await resolvePublicLink(db, token)
    if (resolved.reason) {
      return jsonResponse(
        {
          error: resolved.reason === 'not_found' ? 'not_found' : 'not_open',
          // 화면이 종전 사유 어휘(private/scheduled/closed)를 그대로 읽으므로 유지한다.
          reason: resolved.reason,
          open_at: resolved.openAt ?? null,
          close_at: resolved.closeAt ?? null,
        },
        denyStatus(resolved.reason),
      )
    }
    const link = resolved.link
    // 이 토큰이 모집 모듈의 것이 아니면 여기서 답할 것이 없다(다른 템플릿은 /p/:token이 답한다).
    if (link.moduleType !== 'RECRUITMENT') return jsonResponse({ error: 'not_found' }, 404)

    const { data: form, error } = await db
      .from('application_forms')
      .select(
        'title, landing, ' +
          'fields:application_form_fields(id, field_type, label, is_required, options, file_constraints, sort_order)',
      )
      .eq('program_module_id', link.moduleId)
      .maybeSingle()

    if (error) return jsonResponse({ error: 'internal_error' }, 500)
    if (!form) return jsonResponse({ error: 'not_found' }, 404)

    const fields = ((form.fields as FieldRow[] | null) ?? []).sort(
      (a, b) => a.sort_order - b.sort_order,
    )
    return jsonResponse({
      title: form.title,
      landing: form.landing ?? {},
      fields,
      open_at: link.openAt,
      close_at: link.closeAt,
    })
  } catch (_e) {
    return jsonResponse({ error: 'internal_error' }, 500)
  }
}))
