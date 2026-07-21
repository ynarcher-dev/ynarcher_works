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
  storage_path: string
  content_type: string | null
  byte_size: number | null
  uploaded_by: string | null
  created_at: string
}

/** 레코드에 귀속된 자료 목록(미삭제, 최신순). */
export function useMaterials(targetType: string, targetId: string | undefined) {
  return useQuery({
    queryKey: ['materials', targetType, targetId],
    enabled: Boolean(targetId),
    queryFn: async (): Promise<Material[]> => {
      const { data, error } = await supabase
        .from('attachments')
        .select('*')
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
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
  })
  if (metaErr) {
    // 메타 기록 실패 시 오브젝트를 되돌려 고아 파일이 남지 않게 한다.
    await supabase.storage.from(BUCKET).remove([path])
    throw metaErr
  }
}

/** 자료 업로드 뮤테이션(상세·수정 모드). 성공 시 해당 대상의 목록을 무효화한다. */
export function useUploadMaterial(targetType: string, targetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadMaterialFile(targetType, targetId, file),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['materials', targetType, targetId] }),
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
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['materials', targetType, targetId] }),
  })
}

/**
 * 자료 다운로드: material-download Edge Function 경유로 단기 Signed URL을 받아
 * 브라우저 다운로드를 트리거한다. 서버가 RLS 검증과 access_logs 적재를 강제하며,
 * 로그 적재에 실패하면 URL이 발급되지 않는다(클라이언트 직접 서명 경로는 폐쇄됨).
 */
export async function downloadMaterial(m: Material): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{
    url: string
    fileName: string
  }>('material-download', { body: { attachmentId: m.id } })
  if (error || !data?.url) throw error ?? new Error('download_failed')
  const a = document.createElement('a')
  a.href = data.url
  a.download = m.file_name
  document.body.appendChild(a)
  a.click()
  a.remove()
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
