// [AC 모집] 공개 신청 제출(익명). 배포 URL(/apply/:token)에서 신청자가 제출.
// 요청: { token, consent: boolean, answers: [{field_id, value}], files: [{field_id, file_name, content_type, data_base64}] }
// 응답: { ok: true } | 4xx
//
// 보안(11_migration_security_gate.md):
// - 공개 상태(OPEN)인 신청서에만 접수. 개인정보 수집·이용 동의(consent) 없으면 거부.
// - service_role로 접수 행을 기록한다(익명 신청자에겐 세션이 없으므로 대행 삽입).
//   반환하는 값은 성공 여부뿐이며 어떤 내부/타 신청 데이터도 노출하지 않는다.
// - 첨부는 비공개 attachments 버킷에 저장하고 attachments 메타로 남겨,
//   내부 심사자가 material-download(감사 로그 강제)로만 열람하도록 한다.
// - source='PUBLIC', consented_at 기록으로 공개 접수·동의 시각을 감사 가능하게 남긴다.
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { windowState } from '../_shared/recruitmentWindow.ts'

const ATTACH_BUCKET = 'attachments'
const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20MB/파일
const MAX_FILES = 10

interface FieldRow {
  id: string
  field_type: string
  label: string
  is_required: boolean
}

/** base64(순수) → 바이트. data URL 접두는 클라이언트가 제거해 전송한다. */
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

function safeName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_')
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const token = String(body.token ?? '').trim()
    const consent = body.consent === true
    const answers: { field_id?: string; value?: unknown }[] = Array.isArray(body.answers)
      ? body.answers
      : []
    const files: { field_id?: string; file_name?: string; content_type?: string; data_base64?: string }[] =
      Array.isArray(body.files) ? body.files : []

    if (!token) return jsonResponse({ error: 'invalid_request' }, 400)
    if (!consent) return jsonResponse({ error: 'consent_required' }, 400)
    if (files.length > MAX_FILES) return jsonResponse({ error: 'too_many_files' }, 400)

    const db = supabaseAdmin()
    const { data: form, error: formErr } = await db
      .from('application_forms')
      .select(
        'id, program_id, public_status, open_at, close_at, ' +
          'fields:application_form_fields(id, field_type, label, is_required)',
      )
      .eq('public_token', token)
      .maybeSingle()

    if (formErr) return jsonResponse({ error: 'internal_error' }, 500)
    if (!form) return jsonResponse({ error: 'not_found' }, 404)
    // 공개 상태 + 공개 기간(타이머) 게이트를 서버가 강제한다.
    const gate = windowState(form.public_status, form.open_at, form.close_at)
    if (gate.reason) return jsonResponse({ error: 'not_open', reason: gate.reason }, 403)

    const fields = (form.fields as FieldRow[] | null) ?? []
    const fieldMap = new Map(fields.map((f) => [f.id, f]))

    // 텍스트/선택 응답 수집(폼에 속한 필드만).
    const answerMap = new Map<string, string>()
    for (const a of answers) {
      const fid = String(a.field_id ?? '')
      if (!fieldMap.has(fid)) continue
      answerMap.set(fid, typeof a.value === 'string' ? a.value : '')
    }
    // 파일 필드(폼에 속한 것만), 필드당 1개.
    const fileByField = new Map<string, (typeof files)[number]>()
    for (const f of files) {
      const fid = String(f.field_id ?? '')
      const def = fieldMap.get(fid)
      if (!def || def.field_type !== 'file') continue
      if (!fileByField.has(fid)) fileByField.set(fid, f)
    }

    // 필수 검증.
    for (const f of fields) {
      if (!f.is_required) continue
      if (f.field_type === 'file') {
        if (!fileByField.has(f.id)) return jsonResponse({ error: 'missing_required', field: f.label }, 400)
      } else if (f.field_type !== 'consent') {
        if (!(answerMap.get(f.id) ?? '').trim())
          return jsonResponse({ error: 'missing_required', field: f.label }, 400)
      }
    }

    // 목록 표시용 스냅샷(단문류만; 개인정보 → 목록 마스킹 대상).
    const meta: Record<string, string> = {}
    for (const f of fields) {
      if (['text', 'email', 'tel', 'textarea', 'select'].includes(f.field_type)) {
        const v = answerMap.get(f.id)
        if (v && v.trim()) meta[f.label] = v.trim()
      }
    }

    const now = new Date().toISOString()
    const { data: sub, error: subErr } = await db
      .from('application_submissions')
      .insert({
        program_id: form.program_id,
        form_id: form.id,
        status: 'SUBMITTED',
        source: 'PUBLIC',
        submitted_at: now,
        consented_at: now,
        applicant_meta: meta,
      })
      .select('id')
      .single()
    if (subErr || !sub) return jsonResponse({ error: 'submit_failed' }, 500)

    const answerRows: Record<string, unknown>[] = []
    for (const [fid, val] of answerMap) {
      const def = fieldMap.get(fid)
      if (!def || def.field_type === 'file') continue
      answerRows.push({ submission_id: sub.id, field_id: fid, text_value: val })
    }

    // 파일 업로드 → attachments 메타 + 파일 응답(json_value).
    for (const [fid, file] of fileByField) {
      const name = String(file.file_name ?? 'file')
      const bytes = b64ToBytes(String(file.data_base64 ?? ''))
      if (bytes.byteLength === 0) continue
      if (bytes.byteLength > MAX_FILE_BYTES)
        return jsonResponse({ error: 'file_too_large', field: name }, 400)
      const path = `application_submission/${sub.id}/${crypto.randomUUID()}-${safeName(name)}`
      const { error: upErr } = await db.storage
        .from(ATTACH_BUCKET)
        .upload(path, bytes, { contentType: file.content_type || 'application/octet-stream' })
      if (upErr) return jsonResponse({ error: 'upload_failed' }, 500)
      const { data: att } = await db
        .from('attachments')
        .insert({
          target_type: 'application_submission',
          target_id: sub.id,
          file_name: name,
          storage_path: path,
          content_type: file.content_type || null,
          byte_size: bytes.byteLength,
        })
        .select('id')
        .single()
      answerRows.push({
        submission_id: sub.id,
        field_id: fid,
        json_value: { attachment_id: att?.id ?? null, file_name: name },
      })
    }

    if (answerRows.length) {
      const { error: ansErr } = await db.from('application_answers').insert(answerRows)
      if (ansErr) return jsonResponse({ error: 'answer_failed' }, 500)
    }

    return jsonResponse({ ok: true })
  } catch (_e) {
    return jsonResponse({ error: 'internal_error' }, 500)
  }
}))
