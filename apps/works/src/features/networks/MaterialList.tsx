import { AttachmentRow, IconButton, Spinner } from '@ynarcher/ui'
import { Download, Eye, File as FileIcon, Music, Pause, Pencil, Play, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { MaterialPreviewModal } from '@/features/networks/MaterialPreview'
import { MiniPager, usePaged } from '@ynarcher/ui'
import {
  downloadMaterial,
  fetchMaterialUrl,
  formatBytes,
  isAudioMaterial,
  materialDisplayName,
  materialPreviewKind,
  type Material,
} from '@/features/networks/materialHooks'

/**
 * 자료 목록(공용) — 행·페이저·미리보기 모달을 한 덩어리로 묶은 표시 단위.
 *
 * 자료 관리 패널(우측 상세 패널)과 파일첨부 모듈(모달)이 같은 목록을 보여 주므로 목록 자체를
 * 따로 세운다. 데이터 조회·업로드는 호출부가 맡고 여기서는 받은 배열만 그린다 — 두 화면의
 * 조회 범위가 다르기 때문이다(패널은 사업 전체, 모듈은 자기 모듈 것만).
 */
export function MaterialList({
  materials,
  loading = false,
  onEdit,
  onDelete,
  deletingId,
  emptyText = '등록된 자료가 없습니다.',
  pageSize,
  showDescription = false,
}: {
  materials: Material[]
  loading?: boolean
  /** 미지정 시 표시명·설명 수정 버튼을 숨긴다. */
  onEdit?: (material: Material) => void
  /** 미지정 시 삭제 버튼을 숨긴다(조회 모드). */
  onDelete?: (id: string) => void
  /** 삭제 진행 중인 자료 id(해당 행의 버튼만 비활성화). */
  deletingId?: string
  emptyText?: string
  /** 한 쪽에 보일 건수(기본 5 — usePaged 기본값). */
  pageSize?: number
  /**
   * 설명 줄을 함께 보일지 여부. 기본은 숨김 — 상세 우측 자료 관리 패널은 곁다리 자리라
   * 한 건이 한 줄을 넘기면 본문이 밀린다. 설명을 붙이고 고치는 자리(파일첨부 모듈)에서만 켠다.
   */
  showDescription?: boolean
}) {
  const { pageItems, page, setPage, pageCount } = usePaged(materials, pageSize)
  // 간이 뷰어 모달 대상(목록당 하나만 연다). pdf/이미지/동영상/텍스트를 종류별로 렌더한다.
  const [preview, setPreview] = useState<Material | null>(null)

  if (loading) {
    return (
      <div className="py-4">
        <Spinner />
      </div>
    )
  }
  if (materials.length === 0) {
    return <p className="text-body text-gray-600">{emptyText}</p>
  }

  return (
    <>
      <ul className="space-y-1.5">
        {pageItems.map((m) => (
          <MaterialRow
            key={m.id}
            material={m}
            onPreview={materialPreviewKind(m) ? () => setPreview(m) : undefined}
            onEdit={onEdit ? () => onEdit(m) : undefined}
            onDelete={onDelete ? () => onDelete(m.id) : undefined}
            deleting={deletingId === m.id}
            showDescription={showDescription}
          />
        ))}
      </ul>
      <MiniPager page={page} pageCount={pageCount} onPage={setPage} />
      {preview && <MaterialPreviewModal material={preview} onClose={() => setPreview(null)} />}
    </>
  )
}

/**
 * 자료 1건 행: 표시명·(선택)설명·파일명·용량 + (오디오면)재생 · (미리보기 지원 종류면)미리보기
 * + 다운로드/수정/삭제. 미리보기는 pdf·이미지·동영상·텍스트를 지원한다(그 외는 다운로드만).
 * `onDelete`·`onEdit`·`onPreview` 미지정 시 해당 버튼을 숨긴다.
 *
 * 표시명이 있으면 파일명은 그 아래 회색 메타로 내려간다 — 표시명은 "이게 무엇인지",
 * 파일명은 "무엇을 받게 되는지"라 둘 다 필요하되 이 행의 이름은 하나여야 한다.
 */
export function MaterialRow({
  material,
  onPreview,
  onEdit,
  onDelete,
  deleting,
  showDescription = false,
}: {
  material: Material
  onPreview?: () => void
  onEdit?: () => void
  onDelete?: () => void
  deleting: boolean
  /** 설명 줄 노출 여부(기본 숨김 — MaterialList 주석 참조). */
  showDescription?: boolean
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
    // 행의 상자·간격·글자 단계는 공용 AttachmentRow(@ynarcher/ui)가 소유한다 —
    // GUEST 파일 목록과 같은 표시 규격이며, 여기서는 WORKS 쪽 액션만 슬롯에 채운다.
    <AttachmentRow
      // 오디오는 파일 아이콘 대신 음표 아이콘으로 한눈에 구분한다.
      icon={
        audio ? (
          <Music className="size-4 shrink-0 text-brand" />
        ) : (
          <FileIcon className="size-4 shrink-0 text-gray-500" />
        )
      }
      name={materialDisplayName(material)}
      metaLines={[
        showDescription ? material.description : null,
        material.label?.trim() ? material.file_name : null,
      ]}
      size={formatBytes(material.byte_size)}
      actions={
        <>
          {/*
            재생(오디오)·미리보기(눈)는 상호배타라 한 자리를 공유한다. 해당 없는 파일도
            같은 크기의 빈 칸을 둬, 용량·다운로드 열이 행마다 같은 위치에 오도록 고정한다.
          */}
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
              label={`${materialDisplayName(material)} 표시명·설명 수정`}
              onClick={onEdit}
              icon={<Pencil className="size-4" />}
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
        </>
      }
    >
      {audioUrl && (
        <audio className="mt-2 h-9 w-full" src={audioUrl} controls autoPlay />
      )}
      {urlError && (
        <p className="mt-1 text-caption text-danger">재생 URL을 불러오지 못했습니다.</p>
      )}
    </AttachmentRow>
  )
}
