/**
 * 퀵 리뷰 이미지 Storage 접근 — 비공개 버킷이라 표시에는 단기 Signed URL을 쓴다.
 *
 * 경로(오브젝트 키)만 원장(`ma_sellers.quick_review`의 `intro.images`·`products.images`)에
 * 남기고 URL은 남기지 않는다 — Signed URL은 만료되는 값이라 저장해 두면 어제 저장한 문서가
 * 오늘 깨진 이미지가 된다.
 *
 * 삭제는 배열에서 경로를 빼는 것으로 끝낸다(물리 삭제 금지). 남은 오브젝트는 아무도 참조하지
 * 않으며, 비공개 버킷이라 경로를 아는 사람도 권한 없이는 열 수 없다.
 *
 * 규격은 자산 사진(`features/management/assets/assetPhotos.ts`)과 같다. 그 파일을 그대로 쓰지
 * 않는 것은 **버킷이 곧 권한 경계**이기 때문이다 — 자산 사진 버킷은 `management` 게이트로
 * 열리고 여기는 `mna` 게이트로 열린다. 한 함수가 두 버킷을 인자로 가르게 만들면 어느 워크스페이스의
 * 권한으로 열린 파일인지 호출부마다 따라가 봐야 안다.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const BUCKET = 'ma-quick-review-images'

/** Signed URL 유효 시간(초). 문서를 열어 두고 읽는 시간을 넉넉히 덮는다. */
const SIGNED_TTL_SEC = 60 * 60

/** 파일명에서 Storage 키로 쓸 수 없는 문자를 안전화한다. */
function safeName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_')
}

/**
 * 이미지 1장 업로드 → 오브젝트 키 반환(절의 `images` 배열에 넣는 값).
 *
 * 경로 앞에 셀러 id를 두어 한 기업의 그림이 한 폴더에 모이게 한다. 등록 모드처럼 아직 id가
 * 없는 자리에서는 `draft`로 들어간다 — 그 그림도 결국 저장될 때 본문과 함께 자리를 얻고,
 * 저장하지 않고 나가면 아무도 참조하지 않는 오브젝트로 남는다(비공개 버킷이라 새지 않는다).
 */
export async function uploadQuickReviewImage(sellerId: string | undefined, file: File): Promise<string> {
  const path = `${sellerId ?? 'draft'}/${crypto.randomUUID()}-${safeName(file.name)}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) throw error
  return path
}

/**
 * 경로 → 표시용 Signed URL 맵.
 *
 * 한 장씩 서명하지 않고 한 번에 요청한다(`createSignedUrls`) — 절 둘에 넉 장씩이면 왕복도
 * 여덟 번이라, 문서를 열 때마다 그만큼 늦어진다. 서명에 실패한 경로는 맵에서 빠지며 화면은
 * 그 자리를 빈 칸으로 둔다(한 장이 실패했다고 나머지를 감추지 않는다).
 */
export function useQuickReviewImageUrls(paths: string[]) {
  const key = paths.join('|')
  return useQuery({
    queryKey: ['mna', 'quick-review', 'image-urls', key],
    enabled: paths.length > 0,
    // 만료 전에 다시 받아 둔다 — 문서를 열어 둔 채로 URL이 죽는 상황을 만들지 않는다.
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
