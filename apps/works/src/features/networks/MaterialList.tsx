import { MiniPager, Spinner, usePaged } from '@ynarcher/ui'
import { useState } from 'react'
import { materialPreviewKind, type Material } from '@/features/networks/materialHooks'
import { MaterialPreviewModal } from '@/features/networks/MaterialPreview'
import { MaterialRow } from '@/features/networks/MaterialRow'

/** 자료 목록 공용 입력. 데이터 변경은 호출부가 맡고, 이 컴포넌트는 목록 동작만 조립한다. */
interface Props {
  materials: Material[]
  loading?: boolean
  onDelete?: (id: string) => void
  deletingId?: string
  /** 오디오를 텍스트 입력으로 다시 불러오는 회의 녹음 전용 동작. */
  onTranscribe?: (material: Material) => void
  transcribingId?: string
  emptyText?: string
  pageSize?: number
  showDescription?: boolean
}

/**
 * 자료 목록(공용) — 행·페이저·미리보기 모달을 한 덩어리로 묶은 표시 단위.
 * 자료 관리 패널과 파일첨부 모듈이 같은 목록 표시 규격을 공유한다.
 */
export function MaterialList({
  materials,
  loading = false,
  onDelete,
  deletingId,
  onTranscribe,
  transcribingId,
  emptyText = '등록된 자료가 없습니다.',
  pageSize,
  showDescription = false,
}: Props) {
  const { pageItems, page, setPage, pageCount } = usePaged(materials, pageSize)
  const [preview, setPreview] = useState<Material | null>(null)

  if (loading) {
    return (
      <div className="py-4">
        <Spinner />
      </div>
    )
  }
  if (materials.length === 0) return <p className="text-body text-gray-600">{emptyText}</p>

  return (
    <>
      <ul className="space-y-1.5">
        {pageItems.map((material) => (
          <MaterialRow
            key={material.id}
            material={material}
            onPreview={materialPreviewKind(material) ? () => setPreview(material) : undefined}
            onDelete={onDelete ? () => onDelete(material.id) : undefined}
            deleting={deletingId === material.id}
            onTranscribe={onTranscribe ? () => onTranscribe(material) : undefined}
            transcribing={transcribingId === material.id}
            showDescription={showDescription}
          />
        ))}
      </ul>
      <MiniPager page={page} pageCount={pageCount} onPage={setPage} />
      {preview && <MaterialPreviewModal material={preview} onClose={() => setPreview(null)} />}
    </>
  )
}
