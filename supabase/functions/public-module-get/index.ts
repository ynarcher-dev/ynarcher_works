// [모듈 링크 공유] 공개 모듈 조회(익명). 배포 URL(/p/:token) 렌더용.
// 요청: { token }
// 응답: { program, module, content } | 403 not_open(reason) | 404 not_found
//
// 보안:
// - service_role로 조회하되 **반환 필드를 이 파일이 직접 고른다**. 링크가 여는 것은 모듈
//   하나이며, 같은 사업의 다른 모듈·참가자 명부·내부 메모·담당자는 어떤 경로로도 나가지 않는다.
// - 열람 가능 여부 판정은 _shared/publicModuleLink.ts 하나가 소유한다(파일 내주는 함수와
//   같은 답을 해야 하므로 판정을 복제하지 않는다).
// - 파일은 목록만 답하고 storage_path를 내보내지 않는다 — 실제 내려받기는
//   public-module-file이 단기 서명 URL로만 내준다. 경로를 노출하면 링크를 끈 뒤에도
//   주소가 살아 있어 스위치가 아무것도 닫지 못한다.
// - 개인정보를 반환하지 않는다. 작성자·담당자는 이름조차 내보내지 않으며, 외부에 보일 연락
//   창구는 담당자가 링크에 직접 적은 contact 한 칸뿐이다.
// 근거 기획: docs/docs_planning/3_4_15_ac_public_links.md §5.3, §9
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { denyStatus, resolvePublicLink } from '../_shared/publicModuleLink.ts'

/** 1단계에서 공개 화면을 갖는 템플릿(읽기 전용 3종). 모집은 종전 /apply 경로를 그대로 쓴다. */
const RENDERABLE = new Set(['POST', 'LINK', 'FILE'])

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
          reason: resolved.reason,
          open_at: resolved.openAt ?? null,
          close_at: resolved.closeAt ?? null,
        },
        denyStatus(resolved.reason),
      )
    }
    const link = resolved.link
    if (!RENDERABLE.has(link.moduleType)) {
      return jsonResponse({ error: 'unsupported_type', reason: 'module_closed' }, 403)
    }

    // 본문 — 템플릿에 따라 담기는 것이 다르다.
    let content: unknown = null
    if (link.moduleType === 'POST') {
      const { data } = await db
        .from(link.tables.posts)
        .select('id, title, body, activity_date, created_at')
        .eq('program_module_id', link.moduleId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50)
      content = { posts: data ?? [] }
    } else if (link.moduleType === 'LINK') {
      const { data } = await db
        .from(link.tables.links)
        .select('id, label, url, description, sort_order')
        .eq('program_module_id', link.moduleId)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .limit(200)
      content = { links: data ?? [] }
    } else {
      // 파일첨부. 첨부 대상은 사업이고 모듈은 귀속 표시만 하므로 두 조건을 함께 건다.
      const { data } = await db
        .from('attachments')
        .select('id, file_name, label, description, content_type, byte_size, created_at')
        .eq('target_type', 'program')
        .eq('target_id', link.programId)
        .eq('program_module_id', link.moduleId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200)
      content = { files: data ?? [] }
    }

    // 열린 횟수. 실패해도 화면은 내준다 — 통계 한 줄 때문에 열람을 막을 이유가 없다
    // (감사 로그를 남기지 못하면 발급하지 않는 파일 다운로드와는 성격이 다르다).
    await db.rpc('bump_module_public_link_view', { p_link_id: link.linkId })

    return jsonResponse({
      program: { title: link.programTitle },
      module: {
        type: link.moduleType,
        title: link.moduleTitle,
        start_date: link.settings.start_date ?? null,
        end_date: link.settings.end_date ?? null,
        memo: link.settings.memo ?? null,
      },
      contact: link.contact,
      open_at: link.openAt,
      close_at: link.closeAt,
      content,
    })
  } catch (_e) {
    return jsonResponse({ error: 'internal_error' }, 500)
  }
}))
