import { Button, IconButton, Modal, Spinner, tableText } from '@ynarcher/ui'
import { Download, Eye, File as FileIcon, Music, Pause, Play, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import { MaterialDropZone } from '@/features/networks/MaterialDropZone'
import { MiniPager, usePaged } from '@/features/networks/MiniPager'
import {
  downloadMaterial,
  fetchMaterialBlobUrl,
  fetchMaterialUrl,
  formatBytes,
  isAudioMaterial,
  isPdfMaterial,
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
  // PDF 간이 뷰어 모달 대상(패널당 하나만 연다).
  const [preview, setPreview] = useState<Material | null>(null)

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
            <p className="mt-2 text-caption text-danger">
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
                  onPreview={isPdfMaterial(m) ? () => setPreview(m) : undefined}
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

      {preview && <PdfPreviewModal material={preview} onClose={() => setPreview(null)} />}
    </DetailPanelCard>
  )
}

/**
 * 자료 1건 행: 파일명·용량 + (오디오면)재생 · (PDF면)미리보기 + 다운로드/삭제.
 * `onDelete` 미지정 시 삭제 버튼을, `onPreview` 미지정 시 미리보기 버튼을 숨긴다.
 */
function MaterialRow({
  material,
  onPreview,
  onDelete,
  deleting,
}: {
  material: Material
  onPreview?: () => void
  onDelete?: () => void
  deleting: boolean
}) {
  const [downloading, setDownloading] = useState(false)
  const audio = isAudioMaterial(material)
  // 재생용 Signed URL은 처음 재생을 누를 때 한 번만 받아 온다(펼쳐지면 그 아래 오디오 플레이어 표시).
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [urlError, setUrlError] = useState(false)

  const openPlayer = async () => {
    if (audioUrl || loadingUrl) return
    setLoadingUrl(true)
    setUrlError(false)
    try {
      setAudioUrl(await fetchMaterialUrl(material))
    } catch {
      setUrlError(true)
    } finally {
      setLoadingUrl(false)
    }
  }

  return (
    <li className="rounded-radius-sm border border-gray-200 bg-white px-3 py-2">
      <div className="flex items-center gap-2">
        {/* 오디오는 파일 아이콘 대신 음표 아이콘으로 한눈에 구분한다. */}
        {audio ? (
          <Music className="size-4 shrink-0 text-brand" />
        ) : (
          <FileIcon className="size-4 shrink-0 text-gray-500" />
        )}
        {/* 파일명은 이 행의 식별 값, 용량은 메타 — 크기는 하나로 두고 색으로만 가른다. */}
        <span className={`min-w-0 flex-1 truncate ${tableText.primary}`}>
          {material.file_name}
        </span>
        <span className={`shrink-0 tabular-nums ${tableText.meta}`}>
          {formatBytes(material.byte_size)}
        </span>
        {audio && (
          <IconButton
            variant="ghost"
            label={audioUrl ? `${material.file_name} 접기` : `${material.file_name} 재생`}
            disabled={loadingUrl}
            onClick={() => (audioUrl ? setAudioUrl(null) : void openPlayer())}
            icon={
              loadingUrl ? (
                <Spinner />
              ) : audioUrl ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4" />
              )
            }
          />
        )}
        {onPreview && (
          <IconButton
            variant="ghost"
            label={`${material.file_name} 미리보기`}
            onClick={onPreview}
            icon={<Eye className="size-4" />}
          />
        )}
        <IconButton
          variant="ghost"
          label={`${material.file_name} 다운로드`}
          disabled={downloading}
          onClick={async () => {
            setDownloading(true)
            try {
              await downloadMaterial(material)
            } finally {
              setDownloading(false)
            }
          }}
          icon={<Download className="size-4" />}
        />
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
      </div>
      {audioUrl && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio className="mt-2 h-9 w-full" src={audioUrl} controls autoPlay />
      )}
      {urlError && (
        <p className="mt-1 text-caption text-danger">재생 URL을 불러오지 못했습니다.</p>
      )}
    </li>
  )
}

/**
 * PDF 간이 뷰어 모달. Signed URL은 첨부 다운로드 디스포지션이 붙어 iframe에 직접 넣으면
 * 다운로드되므로, 바이트를 blob URL로 받아 브라우저 내장 PDF 뷰어(iframe)로 띄운다.
 * 닫히면 blob URL을 해제한다. 서버가 RLS·access_logs를 강제하는 material-download 경유.
 */
function PdfPreviewModal({ material, onClose }: { material: Material; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let objectUrl: string | null = null
    let alive = true
    setUrl(null)
    setError(false)
    fetchMaterialBlobUrl(material)
      .then((u) => {
        objectUrl = u
        if (alive) setUrl(u)
        else URL.revokeObjectURL(u)
      })
      .catch(() => {
        if (alive) setError(true)
      })
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [material])

  return (
    <Modal open onClose={onClose} title={material.file_name} size="2xl">
      <div className="h-[75vh] w-full">
        {error ? (
          <p className="py-10 text-center text-body text-danger">
            미리보기를 불러오지 못했습니다. 다운로드해 확인해 주세요.
          </p>
        ) : url ? (
          <iframe title={material.file_name} src={url} className="h-full w-full rounded-radius-sm border border-gray-200" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        )}
      </div>
    </Modal>
  )
}
