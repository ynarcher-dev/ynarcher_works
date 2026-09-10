import { AttachmentRow, IconButton, Spinner } from '@ynarcher/ui'
import {
  Download,
  ExternalLink,
  Eye,
  File as FileIcon,
  FileText,
  Link as LinkIcon,
  Music,
  Pause,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import {
  downloadMaterial,
  fetchMaterialUrl,
  formatBytes,
  isAudioMaterial,
  isLinkMaterial,
  materialDisplayName,
  openMaterialLink,
  type Material,
} from '@/features/networks/materialHooks'

interface Props {
  material: Material
  onPreview?: () => void
  onEdit?: () => void
  onDelete?: () => void
  deleting: boolean
  /** 오디오를 전사 입력으로 불러오는 선택 액션. */
  onTranscribe?: () => void
  transcribing?: boolean
  showDescription?: boolean
}

/** 자료 한 건의 이름·용량·재생/미리보기·다운로드·편집·삭제 동작. */
export function MaterialRow({
  material,
  onPreview,
  onEdit,
  onDelete,
  deleting,
  onTranscribe,
  transcribing = false,
  showDescription = false,
}: Props) {
  const [downloading, setDownloading] = useState(false)
  const link = isLinkMaterial(material)
  const audio = !link && isAudioMaterial(material)
  const name = materialDisplayName(material)
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
    <AttachmentRow
      icon={
        link ? (
          <LinkIcon className="size-4 shrink-0 text-gray-500" />
        ) : audio ? (
          <Music className="size-4 shrink-0 text-brand" />
        ) : (
          <FileIcon className="size-4 shrink-0 text-gray-500" />
        )
      }
      name={name}
      metaLines={[
        showDescription ? material.description : null,
        material.label?.trim() ? material.file_name : null,
      ]}
      size={link ? 'link' : formatBytes(material.byte_size)}
      actions={
        <>
          {audio ? (
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
          ) : onPreview ? (
            <IconButton
              variant="ghost"
              label={`${material.file_name} 미리보기`}
              onClick={onPreview}
              icon={<Eye className="size-4" />}
            />
          ) : (
            <span className="size-icon-card shrink-0" aria-hidden />
          )}
          {onEdit && (
            <IconButton
              variant="ghost"
              label={`${name} 표시명·설명 수정`}
              onClick={onEdit}
              icon={<Pencil className="size-4" />}
            />
          )}
          {onTranscribe && audio && (
            <IconButton
              variant="ghost"
              label={`${name} 텍스트로 변환`}
              disabled={transcribing}
              onClick={onTranscribe}
              icon={transcribing ? <Spinner /> : <FileText className="size-4" />}
            />
          )}
          {link ? (
            <IconButton
              variant="ghost"
              label={`${name} 새 탭에서 열기`}
              onClick={() => openMaterialLink(material)}
              icon={<ExternalLink className="size-4" />}
            />
          ) : (
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
          )}
          {onDelete && (
            <IconButton
              variant="ghost"
              danger
              label={`${name} 삭제`}
              disabled={deleting}
              onClick={onDelete}
              icon={<Trash2 className="size-4" />}
            />
          )}
        </>
      }
    >
      {audioUrl && <audio className="mt-2 h-9 w-full" src={audioUrl} controls autoPlay />}
      {urlError && <p className="mt-1 text-caption text-danger">재생 URL을 불러오지 못했습니다.</p>}
    </AttachmentRow>
  )
}
