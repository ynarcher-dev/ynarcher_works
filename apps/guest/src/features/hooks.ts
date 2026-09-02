import { useMutation } from '@tanstack/react-query'
import { useGuestClient } from '@/lib/useGuestClient'

/**
 * 파일첨부 모듈의 파일 다운로드.
 *
 * 클라이언트가 스스로 서명 URL을 만들지 않는다 — Storage의 직접 접근 경로는 닫혀 있고,
 * material-download Edge Function만이 RLS 재검증과 access_logs 적재를 거쳐 60초짜리 URL을
 * 내준다. 로그를 남기지 못하면 URL도 없다(로그 없는 반출 금지).
 */
export function useDownloadModuleFile() {
  const client = useGuestClient()
  return useMutation({
    mutationFn: async (file: { id: string; file_name: string }) => {
      const { data, error } = await client!.functions.invoke<{
        url: string
        fileName: string
      }>('material-download', { body: { attachmentId: file.id } })
      if (error || !data?.url) throw error ?? new Error('download_failed')
      const a = document.createElement('a')
      a.href = data.url
      a.download = file.file_name
      document.body.appendChild(a)
      a.click()
      a.remove()
    },
  })
}
