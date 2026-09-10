import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** 자료 관리 Storage 버킷(비공개). Signed URL 경유로만 접근한다. */
const BUCKET = 'attachments'

/** public.attachments 다형 첨부 레코드(자료 관리 패널 표시 단위). */
export interface Material {
  id: string
  target_type: string
  target_id: string
  file_name: string
  /** 자료 종류. FILE=스토리지 실물, LINK=바깥 주소. */
  kind: 'FILE' | 'LINK'
  /** LINK 행의 전체 주소(FILE은 null). */
  url: string | null
  storage_path: string | null
  content_type: string | null
  byte_size: number | null
  uploaded_by: string | null
  program_module_id: string | null
  /** 표시명. 비어 있으면 화면은 file_name을 대신 쓴다. */
  label: string | null
  /** 한 줄 설명. */
  description: string | null
  created_at: string
}

/** 목록에 노출할 이름 — 표시명이 있으면 그것, 없으면 파일명(링크는 호스트). */
export function materialDisplayName(m: Material): string {
  return m.label?.trim() || m.file_name
}

/**
 * 링크 자료 여부. 파일에만 뜻이 있는 것(다운로드·용량·미리보기·확장자)을 가르는 기준이다.
 *
 * `url`이 아니라 `kind`로 판정한다 — 두 칸이 어긋날 일은 CHECK 제약이 막지만, 판정의 근거는
 * '무엇인가'를 적어 둔 칸 하나여야 한다(값이 있는지로 종류를 유추하면 칸이 늘 때마다 그 유추가
 * 하나씩 는다).
 */
export function isLinkMaterial(m: Material): boolean {
  return m.kind === 'LINK'
}

/**
 * 주소에서 목록에 세울 호스트를 뽑는다. 이 값이 `file_name` 자리에 들어간다 —
 * 그 칸은 "무엇을 받게 되는가"를 답하는 자리이고, 링크에서 그것은 어느 사이트인가다.
 */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.slice(0, 80)
  }
}

/**
 * 레코드에 귀속된 자료 목록(미삭제, 최신순).
 *
 * `moduleId`를 주면 그 사업 모듈이 올린 파일만 좁혀 본다(파일첨부 모듈). 주지 않으면 대상
 * 레코드의 자료 전부다 — 파일첨부 모듈이 올린 파일도 결국 그 사업의 자료이므로 사업 자료
 * 관리 패널에는 그대로 함께 보인다(같은 attachments 행 하나를 두 화면이 본다).
 *
 * 쿼리 키는 대상까지가 앞자리이므로 `['materials', targetType, targetId]`로 무효화하면
 * 모듈별 목록까지 함께 갱신된다(모듈에서 올린 파일이 사업 자료 목록에 즉시 뜨는 이유).
 */
export function useMaterials(
  targetType: string,
  targetId: string | undefined,
  moduleId?: string,
) {
  return useQuery({
    queryKey: ['materials', targetType, targetId, moduleId ?? null],
    enabled: Boolean(targetId),
    queryFn: async (): Promise<Material[]> => {
      let query = supabase
        .from('attachments')
        .select('*')
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .is('deleted_at', null)
      if (moduleId) query = query.eq('program_module_id', moduleId)
      const { data, error } = await query.order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Material[]
    },
  })
}

/** 파일명에서 Storage 키로 쓸 수 없는 문자를 안전화한다. */
function safeName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_')
}

/**
 * 자료 1건 업로드(공용 실행부): Storage 버킷에 올린 뒤 attachments 메타 행을 남긴다.
 * 경로는 `${target_type}/${target_id}/${uuid}-${파일명}`으로 충돌을 피한다.
 * 메타 insert 실패 시 방금 올린 오브젝트를 되돌린다(고아 파일 방지).
 * 등록 폼의 보류 자료(등록 완료 후 일괄 업로드)도 이 함수를 공유한다.
 */
export async function uploadMaterialFile(
  targetType: string,
  targetId: string,
  file: File,
  programModuleId?: string,
): Promise<void> {
  const path = `${targetType}/${targetId}/${crypto.randomUUID()}-${safeName(file.name)}`
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined })
  if (upErr) throw upErr

  const { error: metaErr } = await supabase.from('attachments').insert({
    target_type: targetType,
    target_id: targetId,
    file_name: file.name,
    storage_path: path,
    content_type: file.type || null,
    byte_size: file.size,
    // 파일첨부 모듈에서 올린 파일만 귀속 모듈을 남긴다(대상은 여전히 사업 자체다).
    program_module_id: programModuleId ?? null,
  })
  if (metaErr) {
    // 메타 기록 실패 시 오브젝트를 되돌려 고아 파일이 남지 않게 한다.
    await supabase.storage.from(BUCKET).remove([path])
    throw metaErr
  }
}

/**
 * 첨부 건수 목록(목록 화면의 클립 표식 등)의 쿼리 키 접두사.
 *
 * 첨부가 늘거나 줄면 그 대상의 자료 목록만이 아니라 **그 대상을 세고 있던 목록 화면**도
 * 함께 낡는다. 두 키는 접두사가 달라 한 번의 무효화로 함께 걸리지 않으므로, 첨부를
 * 바꾸는 뮤테이션이 둘 다 무효화한다(그 키를 쓰는 화면이 없으면 아무 일도 일어나지 않는다).
 */
export const ATTACHMENT_COUNT_KEY = 'attachment-counts'

/** 첨부 변경 후 무효화할 키 두 벌 — 그 대상의 자료 목록과, 그 종류를 세던 목록 화면. */
function invalidateMaterials(qc: ReturnType<typeof useQueryClient>, targetType: string, targetId: string) {
  void qc.invalidateQueries({ queryKey: ['materials', targetType, targetId] })
  void qc.invalidateQueries({ queryKey: [ATTACHMENT_COUNT_KEY, targetType] })
}

/**
 * 자료 업로드 뮤테이션(상세·수정 모드). 성공 시 해당 대상의 목록을 무효화한다.
 * `moduleId`를 주면 그 모듈 귀속으로 올린다(파일첨부 모듈).
 */
export function useUploadMaterial(targetType: string, targetId: string, moduleId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadMaterialFile(targetType, targetId, file, moduleId),
    onSuccess: () => invalidateMaterials(qc, targetType, targetId),
  })
}

/**
 * 링크 자료 1건 추가(공용 실행부). 스토리지를 거치지 않고 메타 행만 남긴다.
 *
 * 제목·설명은 `link-metadata` Edge Function이 읽어 온 OG 값으로 미리 채운다 — 담당자가 주소만
 * 붙여도 목록에 "무엇인지"가 서야 하기 때문이다. 그 조회는 실패해도 무시한다(로그인이 필요한
 * 페이지·차단된 사이트는 제목을 못 얻을 뿐, 주소를 남기는 일 자체가 막힐 이유는 없다).
 */
export async function addMaterialLink(
  targetType: string,
  targetId: string,
  url: string,
  programModuleId?: string,
): Promise<void> {
  const trimmed = url.trim()
  // 제목·설명 조회는 있으면 좋은 값이라 실패를 삼킨다(주소를 남기는 일이 막힐 이유는 없다).
  const { data: meta } = await supabase.functions
    .invoke<{ title?: string | null; description?: string | null }>('link-metadata', {
      body: { url: trimmed },
    })
    .catch(() => ({ data: null }))
  const { error } = await supabase.from('attachments').insert({
    target_type: targetType,
    target_id: targetId,
    kind: 'LINK',
    url: trimmed,
    // 파일명 자리에는 호스트가 들어간다(목록·검색용). 전체 주소는 url이 갖는다.
    file_name: linkHost(trimmed),
    storage_path: null,
    content_type: null,
    byte_size: null,
    label: meta?.title?.trim() || null,
    description: meta?.description?.trim() || null,
    program_module_id: programModuleId ?? null,
  })
  if (error) throw error
}

/** 링크 추가 뮤테이션. 성공 시 해당 대상의 목록을 무효화한다(파일 업로드와 같은 규약). */
export function useAddMaterialLink(targetType: string, targetId: string, moduleId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (url: string) => addMaterialLink(targetType, targetId, url, moduleId),
    onSuccess: () => invalidateMaterials(qc, targetType, targetId),
  })
}

/**
 * 표시명·설명 수정. 파일 자체(Storage 오브젝트·파일명)는 건드리지 않는다 — 바꾸는 것은
 * "이 파일이 무엇인지 부르는 말"이지 파일이 아니다.
 */
export function useUpdateMaterialMeta(targetType: string, targetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; label: string | null; description: string | null }) => {
      const { error } = await supabase
        .from('attachments')
        .update({ label: input.label, description: input.description })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials', targetType, targetId] }),
  })
}

/** 자료 소프트 삭제: 메타 행만 숨기고 Storage 오브젝트는 보존한다(물리삭제 금지). */
export function useDeleteMaterial(targetType: string, targetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('attachments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateMaterials(qc, targetType, targetId),
  })
}

/**
 * 자료의 단기 Signed URL을 받는다: material-download Edge Function이 RLS 검증과
 * access_logs 적재를 강제하며, 로그 적재에 실패하면 URL이 발급되지 않는다
 * (클라이언트 직접 서명 경로는 폐쇄됨). 다운로드·인라인 재생이 공유한다.
 */
export async function fetchMaterialUrl(m: Material): Promise<string> {
  // 링크에는 서명할 실물이 없다. 여기까지 오는 것 자체가 화면의 분기 실수이므로 조용히
  // 주소를 돌려주지 않고 끊는다 — 돌려주면 '다운로드'가 바깥 페이지를 내려받는 일이 된다.
  if (isLinkMaterial(m)) throw new Error('link_has_no_file')
  const { data, error } = await supabase.functions.invoke<{
    url: string
    fileName: string
  }>('material-download', { body: { attachmentId: m.id } })
  if (error || !data?.url) throw error ?? new Error('download_failed')
  return data.url
}

/**
 * 저장된 첨부를 다시 파일 입력처럼 다룰 때 쓸 `File`로 받는다.
 *
 * 다운로드 URL을 직접 전사 API에 넘기지 않는다 — 짧게 사라지는 서명 URL은 접근 로그를 남긴
 * 뒤 브라우저가 읽는 통로이고, 녹음 전사는 사용자가 방금 고른 로컬 파일과 같은 입력 모양을
 * 받아야 청크 분할·파일명·MIME 판정이 한 경로를 탄다.
 */
export async function fetchMaterialFile(m: Material): Promise<File> {
  const url = await fetchMaterialUrl(m)
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch_failed')
  const blob = await res.blob()
  return new File([blob], m.file_name, {
    type: m.content_type || blob.type || 'application/octet-stream',
  })
}

/** 링크 자료를 새 탭에서 연다. 파일의 다운로드와 짝을 이루는 동작이다. */
export function openMaterialLink(m: Material): void {
  if (!m.url) return
  window.open(m.url, '_blank', 'noopener,noreferrer')
}

/** 자료 다운로드: 단기 Signed URL을 받아 브라우저 다운로드를 트리거한다. */
export async function downloadMaterial(m: Material): Promise<void> {
  const url = await fetchMaterialUrl(m)
  const a = document.createElement('a')
  a.href = url
  a.download = m.file_name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** 오디오 자료 여부(인라인 재생 대상). content_type 우선, 없으면 확장자로 판정. */
export function isAudioMaterial(m: Material): boolean {
  if (m.content_type?.startsWith('audio/')) return true
  return /\.(wav|mp3|m4a|aac|ogg|oga|webm|flac)$/i.test(m.file_name)
}

/** PDF 자료 여부(모달 간이 뷰어 대상). */
export function isPdfMaterial(m: Material): boolean {
  if (m.content_type === 'application/pdf') return true
  return /\.pdf$/i.test(m.file_name)
}

/** 이미지 자료 여부(모달 인라인 뷰어 대상). */
export function isImageMaterial(m: Material): boolean {
  if (m.content_type?.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif|apng|ico)$/i.test(m.file_name)
}

/**
 * 동영상 자료 여부(모달 인라인 플레이어 대상). webm은 오디오 판별과 겹치므로
 * content_type이 video/일 때만 동영상으로 본다(파일명 확장자에서는 제외).
 */
export function isVideoMaterial(m: Material): boolean {
  if (m.content_type?.startsWith('video/')) return true
  return /\.(mp4|m4v|mov|ogv)$/i.test(m.file_name)
}

/** 텍스트/코드/CSV 자료 여부(모달 간이 뷰어 대상). content_type 우선, 없으면 확장자로 판정. */
export function isTextMaterial(m: Material): boolean {
  const ct = m.content_type
  if (ct?.startsWith('text/') || ct === 'application/json' || ct === 'application/xml') return true
  return /\.(txt|md|markdown|csv|tsv|json|log|xml|ya?ml|ini|conf|css|html?|js|jsx|ts|tsx|py|java|c|cpp|h|go|rs|rb|php|sh|sql)$/i.test(
    m.file_name,
  )
}

/** 모달 미리보기 종류(오디오는 행에서 인라인 재생하므로 여기서 제외). 지원 안 하면 null. */
export type PreviewKind = 'pdf' | 'image' | 'video' | 'text'
export function materialPreviewKind(m: Material): PreviewKind | null {
  // 링크는 미리보기가 없다 — 여는 것이 곧 보는 것이라, 모달로 한 겹 감싸면 자리만 늘고
  // 바깥 페이지를 우리 화면 안에 넣은 것처럼 보인다. 파일명 확장자로 종류를 유추하는
  // 아래 판정들이 주소의 `.pdf` 같은 꼬리에 걸려 오작동하는 것도 여기서 함께 막힌다.
  if (isLinkMaterial(m)) return null
  if (isImageMaterial(m)) return 'image'
  if (isVideoMaterial(m)) return 'video'
  if (isPdfMaterial(m)) return 'pdf'
  if (isTextMaterial(m)) return 'text'
  return null
}

/**
 * 자료를 blob URL로 받는다(모달 인라인 뷰어용). Signed URL은 첨부 다운로드용
 * Content-Disposition이 붙어 iframe에 그대로 넣으면 다운로드되므로, 바이트를 받아
 * 자체 blob URL로 만든다. 호출부는 사용 후 URL.revokeObjectURL로 해제해야 한다.
 */
export async function fetchMaterialBlobUrl(m: Material): Promise<string> {
  const url = await fetchMaterialUrl(m)
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch_failed')
  return URL.createObjectURL(await res.blob())
}

/** 텍스트/코드/CSV 미리보기 표시 상한(초과분은 앞부분만 보여준다). */
export const TEXT_PREVIEW_LIMIT = 1_000_000

/**
 * 자료를 텍스트로 받는다(텍스트/코드/CSV 모달 뷰어용). 과대 파일은 앞부분만 잘라
 * 반환하며(브라우저 렌더 보호), 초과 여부는 truncated로 알린다.
 */
export async function fetchMaterialText(
  m: Material,
): Promise<{ text: string; truncated: boolean }> {
  const url = await fetchMaterialUrl(m)
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch_failed')
  const full = await res.text()
  return full.length > TEXT_PREVIEW_LIMIT
    ? { text: full.slice(0, TEXT_PREVIEW_LIMIT), truncated: true }
    : { text: full, truncated: false }
}

/** 바이트를 사람이 읽는 단위로 변환. */
export function formatBytes(bytes: number | null): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let n = bytes / 1024
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i += 1
  }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`
}
