/**
 * 거래처 증빙 서류 Storage 접근 — 비공개 버킷(partner-docs)이라 열람에는 단기 Signed URL을 쓴다.
 *
 * 경로(오브젝트 키)와 표시용 파일명만 원장에 남기고 URL은 남기지 않는다 — Signed URL은 만료되는
 * 값이라 저장해 두면 어제 저장한 행이 오늘 열리지 않는다.
 *
 * 열람 전에 반드시 접근 로그를 남긴다(log_sensitive_access RPC). 여기 담기는 것은 사업자등록증·
 * 신분증·통장사본이라, 누가 언제 무엇을 열었는지가 남지 않으면 유출 경위를 되짚을 근거가 없다.
 * 로그 적재가 실패하면 URL을 만들지 않는다 — 자료(attachments) 다운로드와 같은 계약이다.
 *
 * 사유를 매번 묻지 않는 이유는 이 화면에서 서류를 여는 이유가 하나(지급·정산 준비)뿐이기
 * 때문이다. 물어봐야 같은 말이 반복될 뿐이고, 정작 남겨야 하는 것은 사유가 아니라
 * "누가 언제 어느 거래처의 무엇을 열었는가"다.
 *
 * 삭제는 원장에서 경로를 비우는 것으로 끝내고 오브젝트는 지우지 않는다(물리 삭제 금지).
 */
import { supabase } from '@/lib/supabase'
import { licenseLabel, type PartnerType } from '@/features/management/partners/config'

const BUCKET = 'partner-docs'

/** Signed URL 유효 시간(초). 받는 즉시 브라우저가 내려받으므로 짧게 둔다. */
const SIGNED_TTL_SEC = 60

/** 서류 2종. 원장의 컬럼 짝(license_path·bankbook_path)과 대응한다. */
export type PartnerDocKind = 'license' | 'bankbook'

/** 서류 이름 — 사업자등록증(개인은 신분증)은 구분을 따라 갈리고, 통장사본은 그대로다. */
export function partnerDocLabel(kind: PartnerDocKind, type: PartnerType): string {
  return kind === 'license' ? licenseLabel(type) : '통장사본'
}

/** 파일명에서 Storage 키로 쓸 수 없는 문자를 안전화한다(원본 이름은 원장이 따로 들고 있다). */
function safeName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_')
}

/** 서류 1건 업로드 → 오브젝트 키 반환(원장의 *_path에 넣는 값). */
export async function uploadPartnerDoc(file: File): Promise<string> {
  const path = `${crypto.randomUUID()}-${safeName(file.name)}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) throw error
  return path
}

/**
 * 서류 내려받기 — 접근 로그를 남긴 뒤에만 Signed URL을 만든다.
 *
 * 아직 저장하지 않은 첨부(등록 중)는 거래처 id가 없다. 그때도 로그는 남긴다 — 대상을 특정하지
 * 못할 뿐, 누가 언제 어떤 종류의 서류를 열었는지는 남아야 한다.
 */
export async function downloadPartnerDoc(params: {
  kind: PartnerDocKind
  partnerType: PartnerType
  partnerId?: string
  path: string
  fileName: string
}): Promise<void> {
  const label = partnerDocLabel(params.kind, params.partnerType)
  const { error: logError } = await supabase.rpc('log_sensitive_access', {
    p_resource_type: 'trade_partner_document',
    p_resource_id: params.partnerId ?? null,
    p_reason: `거래처 ${label} 열람`,
  })
  if (logError) throw logError

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(params.path, SIGNED_TTL_SEC, { download: params.fileName })
  if (error || !data?.signedUrl) throw error ?? new Error('sign_failed')

  const a = document.createElement('a')
  a.href = data.signedUrl
  a.download = params.fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
}
