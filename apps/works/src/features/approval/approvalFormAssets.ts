import { supabase } from '@/lib/supabase'

const BUCKET = 'approval-form-assets'

function safeName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_')
}

/** ADMIN 양식 편집에서 공문 머리·꼬리 이미지를 우리 Storage로 올린다. */
export async function uploadApprovalFormAsset(file: File): Promise<string> {
  const path = `${crypto.randomUUID()}-${safeName(file.name)}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) throw error
  return path
}

/** 양식에는 만료되는 URL이 아니라 오브젝트 경로를 저장하고, 표시할 때 공개 URL로 바꾼다. */
export function approvalFormAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (/^(https?:|data:image\/)/i.test(path)) return path
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
