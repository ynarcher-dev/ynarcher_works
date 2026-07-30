/**
 * 자산 사진 Storage 접근 — 비공개 버킷(asset-photos)이라 표시에는 단기 Signed URL을 쓴다.
 *
 * 경로(오브젝트 키)만 원장(assets.photo_paths)에 남기고 URL은 남기지 않는다 — Signed URL은
 * 만료되는 값이라 저장해 두면 어제 저장한 행이 오늘 깨진 이미지가 된다.
 *
 * 삭제는 배열에서 경로를 빼는 것으로 끝낸다(물리 삭제 금지). 남은 오브젝트는 아무도 참조하지
 * 않으며, 비공개 버킷이라 경로를 아는 사람도 권한 없이는 열 수 없다.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const BUCKET = 'asset-photos'

/** Signed URL 유효 시간(초). 폼을 열어 두고 작업하는 시간을 넉넉히 덮는다. */
const SIGNED_TTL_SEC = 60 * 60

/** 파일명에서 Storage 키로 쓸 수 없는 문자를 안전화한다. */
function safeName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_')
}

/** 사진 1장 업로드 → 오브젝트 키 반환(assets.photo_paths에 넣는 값). */
export async function uploadAssetPhoto(file: File): Promise<string> {
  const path = `${crypto.randomUUID()}-${safeName(file.name)}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) throw error
  return path
}

/**
 * 경로 → 표시용 Signed URL 맵.
 *
 * 한 장씩 서명하지 않고 한 번에 요청한다(`createSignedUrls`) — 다섯 장이면 왕복도 다섯 번이라,
 * 목록에서 자산을 열 때마다 그만큼 늦어진다. 서명에 실패한 경로는 맵에서 빠지며 화면은 그
 * 자리를 빈 칸으로 둔다(한 장이 실패했다고 나머지를 감추지 않는다).
 */
export function useAssetPhotoUrls(paths: string[]) {
  const key = paths.join('|')
  return useQuery({
    queryKey: ['management', 'assets', 'photo-urls', key],
    enabled: paths.length > 0,
    // 만료 전에 다시 받아 둔다 — 폼을 열어 둔 채로 URL이 죽는 상황을 만들지 않는다.
    staleTime: (SIGNED_TTL_SEC - 300) * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, SIGNED_TTL_SEC)
      if (error) throw error
      const urls: Record<string, string> = {}
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) urls[item.path] = item.signedUrl
      }
      return urls
    },
  })
}
