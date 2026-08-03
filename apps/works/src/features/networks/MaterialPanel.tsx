import { Button } from '@ynarcher/ui'
import { useRef } from 'react'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import { MaterialDropZone } from '@/features/networks/MaterialDropZone'
import { MaterialList } from '@/features/networks/MaterialList'
import { useDeleteMaterial, useMaterials, useUploadMaterial } from '@/features/networks/materialHooks'

/**
 * 자료 관리 패널(공용). 레코드에 귀속된 파일의 업로드·다운로드·삭제(소프트)를 담당한다.
 * 저장은 비공개 Storage 버킷 + attachments 다형 테이블(target_type/target_id)로 처리한다.
 * 국내·글로벌 상세페이지가 공유하며, 대상은 `targetType`/`targetId`로 주입한다.
 *
 * 목록·행·미리보기는 공용 `MaterialList`가 소유한다(파일첨부 모듈 모달과 같은 표시 규격).
 *
 * `readOnly`(조회 모드)면 업로드/삭제 없이 목록·다운로드만 노출한다.
 * 업로드/삭제는 수정 모드(폼 내부 자료 관리 카드)에서만 가능하다.
 */
export function MaterialPanel({
  targetType,
  targetId,
  moduleId,
  readOnly = false,
  title = '자료 관리',
}: {
  /** 첨부 대상 유형(예: 'expert' | 'investor' | 'global_network'). */
  targetType: string
  /** 첨부 대상 레코드 id. */
  targetId: string
  /**
   * 사업 모듈 인스턴스 id. 주면 그 모듈에 귀속된 자료만 보고 업로드도 그 모듈로 붙는다.
   * 첨부 대상은 여전히 사업이므로 사업 자료 관리 패널에는 같은 행이 함께 보인다.
   */
  moduleId?: string
  /** 조회 모드: 목록·다운로드만 노출(업로드/삭제 숨김). */
  readOnly?: boolean
  /** 패널 제목(기본 '자료 관리'). 한 레코드에 자료 분류가 여러 개일 때 구분용. */
  title?: string
}) {
  // 드롭존이 소유한 파일 입력을 헤더 '업로드' 버튼에서도 열기 위한 핸들.
  const openPicker = useRef<(() => void) | null>(null)
  const { data: materials, isLoading } = useMaterials(targetType, targetId, moduleId)
  const upload = useUploadMaterial(targetType, targetId, moduleId)
  const remove = useDeleteMaterial(targetType, targetId)
  const list = materials ?? []

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
          <Button variant="secondary" disabled={busy} onClick={() => openPicker.current?.()}>
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
        <MaterialList
          materials={list}
          loading={isLoading}
          onDelete={readOnly ? undefined : (id) => remove.mutate(id)}
          deletingId={remove.isPending ? remove.variables : undefined}
        />
      </div>
    </DetailPanelCard>
  )
}
