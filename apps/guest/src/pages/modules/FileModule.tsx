import { AttachmentRow, Card, IconButton, MiniPager, usePaged, useToast } from '@ynarcher/ui'
import { Download, File as FileIcon } from 'lucide-react'
import { useModuleFiles, type GuestFile } from '@/features/moduleHooks'
import { useDownloadModuleFile } from '@/features/hooks'
import { formatBytes } from '@/lib/format'

/**
 * 파일첨부 메뉴 — 운영자가 올려 둔 파일을 내려받는다.
 *
 * 목록의 행은 사업 자료와 **같은 행**이다(attachments). 게스트용 사본을 두지 않으므로,
 * 운영자가 자료를 지우면 이 목록에서도 곧바로 사라진다.
 *
 * 행은 WORKS 자료 관리와 **같은 표시 규격**(공용 AttachmentRow)을 쓴다 — 같은 첨부가
 * 두 앱에서 다른 모양으로 서지 않는다. 다운로드 통로만 게스트 것(Edge Function)이다.
 */
export function FileModule({ moduleId }: { moduleId: string }) {
  const { data } = useModuleFiles(moduleId)
  return <GuestFileCard files={data ?? []} />
}

/**
 * 파일 목록 카드 — 목록을 카드로 감싼 것. 메뉴 화면과 사업개요의 곁칸이 쓴다.
 * 게시판 상세 모달은 카드 없이 `GuestFileList`만 쓴다(모달 자체가 이미 상자다).
 */
export function GuestFileCard({
  files,
  title = '파일',
}: {
  files: GuestFile[]
  /** 카드 제목. 메뉴에서는 '파일', 게시판 곁칸에서는 '첨부 파일'. */
  title?: string
}) {
  return (
    <Card title={title} count={files.length}>
      <GuestFileList files={files} />
    </Card>
  )
}

/**
 * 파일 목록(상자 없는 표시 단위). 카드 안과 모달 안이 같은 행 규격을 공유한다 —
 * 같은 첨부가 놓이는 자리에 따라 다른 모양이 되면 안 된다.
 */
export function GuestFileList({ files }: { files: GuestFile[] }) {
  const download = useDownloadModuleFile()
  const toast = useToast()
  const { pageItems, page, setPage, pageCount } = usePaged(files)

  const onDownload = async (file: GuestFile) => {
    try {
      await download.mutateAsync({ id: file.id, file_name: file.file_name })
    } catch {
      toast.show('파일을 내려받지 못했습니다. 잠시 후 다시 시도해 주십시오.', 'danger')
    }
  }

  if (files.length === 0) {
    return <p className="text-body text-gray-600">첨부된 파일이 없습니다.</p>
  }

  return (
    <>
      <ul className="space-y-1.5">
        {pageItems.map((file) => (
          <AttachmentRow
            key={file.id}
            icon={<FileIcon className="size-4 shrink-0 text-gray-500" />}
            name={file.file_name}
            size={formatBytes(file.byte_size)}
            actions={
              <IconButton
                variant="ghost"
                label={`${file.file_name} 다운로드`}
                disabled={download.isPending}
                onClick={() => void onDownload(file)}
                icon={<Download className="size-4" />}
              />
            }
          />
        ))}
      </ul>
      <MiniPager page={page} pageCount={pageCount} onPage={setPage} />
    </>
  )
}
