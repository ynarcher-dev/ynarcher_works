import { Card, useToast } from '@ynarcher/ui'
import { useModuleFiles, type GuestFile } from '@/features/moduleHooks'
import { useDownloadModuleFile } from '@/features/hooks'
import { GuestButton } from '@/components/GuestButton'
import { formatBytes, formatDate } from '@/lib/format'

/**
 * 파일첨부 메뉴 — 운영자가 올려 둔 파일을 내려받는다.
 *
 * 목록의 행은 사업 자료와 **같은 행**이다(attachments). 게스트용 사본을 두지 않으므로,
 * 운영자가 자료를 지우면 이 목록에서도 곧바로 사라진다.
 */
export function FileModule({ moduleId }: { moduleId: string }) {
  const { data } = useModuleFiles(moduleId)
  const download = useDownloadModuleFile()
  const toast = useToast()
  const files = data ?? []

  const onDownload = async (file: GuestFile) => {
    try {
      await download.mutateAsync({ id: file.id, file_name: file.file_name })
    } catch {
      toast.show('파일을 내려받지 못했습니다. 잠시 후 다시 시도해 주십시오.', 'danger')
    }
  }

  return (
    <Card title="파일" count={files.length}>
      <div className="space-y-2">
        {files.map((file) => (
          <div
            key={file.id}
            className="flex items-center justify-between gap-3 rounded-radius-md border border-gray-300 px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block truncate text-body text-gray-900">{file.file_name}</span>
              <span className="block text-caption tabular-nums text-gray-600">
                {formatBytes(file.byte_size)} · {formatDate(file.created_at)}
              </span>
            </span>
            <GuestButton
              variant="outline"
              disabled={download.isPending}
              onClick={() => void onDownload(file)}
            >
              받기
            </GuestButton>
          </div>
        ))}
        {files.length === 0 && (
          <p className="py-4 text-center text-caption text-gray-500">
            등록된 파일이 없습니다.
          </p>
        )}
      </div>
    </Card>
  )
}
