import { Button, IconButton, Spinner } from '@ynarcher/ui'
import { Download, File as FileIcon, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import { MaterialDropZone } from '@/features/networks/MaterialDropZone'
import { MiniPager, usePaged } from '@/features/networks/MiniPager'
import {
  downloadMaterial,
  formatBytes,
  useDeleteMaterial,
  useMaterials,
  useUploadMaterial,
  type Material,
} from '@/features/networks/materialHooks'

/**
 * 자료 관리 패널(공용). 레코드에 귀속된 파일의 업로드·다운로드·삭제(소프트)를 담당한다.
 * 저장은 비공개 Storage 버킷 + attachments 다형 테이블(target_type/target_id)로 처리한다.
 * 국내·글로벌 상세페이지가 공유하며, 대상은 `targetType`/`targetId`로 주입한다.
 *
 * `readOnly`(조회 모드)면 업로드/삭제 없이 목록·다운로드만 노출한다.
 * 업로드/삭제는 수정 모드(폼 내부 자료 관리 카드)에서만 가능하다.
 */
export function MaterialPanel({
  targetType,
  targetId,
  readOnly = false,
  title = '자료 관리',
}: {
  /** 첨부 대상 유형(예: 'expert' | 'investor' | 'global_network'). */
  targetType: string
  /** 첨부 대상 레코드 id. */
  targetId: string
  /** 조회 모드: 목록·다운로드만 노출(업로드/삭제 숨김). */
  readOnly?: boolean
  /** 패널 제목(기본 '자료 관리'). 한 레코드에 자료 분류가 여러 개일 때 구분용. */
  title?: string
}) {
  // 드롭존이 소유한 파일 입력을 헤더 '업로드' 버튼에서도 열기 위한 핸들.
  const openPicker = useRef<(() => void) | null>(null)
  const { data: materials, isLoading } = useMaterials(targetType, targetId)
  const upload = useUploadMaterial(targetType, targetId)
  const remove = useDeleteMaterial(targetType, targetId)
  const list = materials ?? []
  const { pageItems, page, setPage, pageCount } = usePaged(list)

  const addFiles = (files: File[]) => {
    for (const file of files) upload.mutate(file)
  }

  const busy = upload.isPending

  return (
    <DetailPanelCard
      title={title}
      count={list.length}
      action={
        readOnly ? undefined : (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => openPicker.current?.()}
          >
            {busy ? '업로드 중…' : '업로드'}
          </Button>
        )
      }
    >
      {!readOnly && (
        <>
          <MaterialDropZone onFiles={addFiles} openRef={openPicker} />

          {upload.isError && (
            <p className="mt-2 text-caption text-brand">
              업로드에 실패했습니다. 다시 시도해 주세요.
            </p>
          )}
        </>
      )}

      <div className={readOnly ? '' : 'mt-3'}>
        {isLoading ? (
          <div className="py-4">
            <Spinner />
          </div>
        ) : list.length > 0 ? (
          <>
            <ul className="space-y-1.5">
              {pageItems.map((m) => (
                <MaterialRow
                  key={m.id}
                  material={m}
                  onDelete={
                    readOnly ? undefined : () => remove.mutate(m.id)
                  }
                  deleting={remove.isPending && remove.variables === m.id}
                />
              ))}
            </ul>
            <MiniPager page={page} pageCount={pageCount} onPage={setPage} />
          </>
        ) : (
          <p className="text-body text-gray-600">등록된 자료가 없습니다.</p>
        )}
      </div>
    </DetailPanelCard>
  )
}

/** 자료 1건 행: 파일명·용량 + 다운로드/삭제. `onDelete` 미지정 시 삭제 버튼을 숨긴다. */
function MaterialRow({
  material,
  onDelete,
  deleting,
}: {
  material: Material
  onDelete?: () => void
  deleting: boolean
}) {
  const [downloading, setDownloading] = useState(false)
  return (
    <li className="flex items-center gap-2 rounded-radius-sm border border-gray-200 bg-white px-3 py-2">
      <FileIcon className="size-4 shrink-0 text-gray-500" />
      <span className="min-w-0 flex-1 truncate text-body text-gray-800">
        {material.file_name}
      </span>
      <span className="shrink-0 tabular-nums text-caption text-gray-700">
        {formatBytes(material.byte_size)}
      </span>
      <button
        type="button"
        aria-label={`${material.file_name} 다운로드`}
        disabled={downloading}
        onClick={async () => {
          setDownloading(true)
          try {
            await downloadMaterial(material)
          } finally {
            setDownloading(false)
          }
        }}
        className="grid size-6 shrink-0 place-items-center rounded-radius-sm text-gray-600 transition-colors duration-fast hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
      >
        <Download className="size-4" />
      </button>
      {onDelete && (
        <IconButton
          variant="ghost"
          danger
          label={`${material.file_name} 삭제`}
          disabled={deleting}
          onClick={onDelete}
          icon={<Trash2 className="size-4" />}
        />
      )}
    </li>
  )
}
