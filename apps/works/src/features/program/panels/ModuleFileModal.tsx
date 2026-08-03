import { Button, Modal } from '@ynarcher/ui'
import { useRef } from 'react'
import { MaterialDropZone } from '@/features/networks/MaterialDropZone'
import { MaterialList } from '@/features/networks/MaterialList'
import {
  useDeleteMaterial,
  useMaterials,
  useUploadMaterial,
} from '@/features/networks/materialHooks'

/**
 * 파일첨부 모듈(모달). 모듈 카드를 누르면 파일 목록이 열려 바로 미리보기·다운로드한다.
 *
 * 여기서 올린 파일은 사업 상세의 자료 관리 패널에도 **같은 행**으로 나타난다. 첨부 대상은
 * 어디까지나 사업(target_type='program', target_id=사업id)이고 모듈은 귀속 표시
 * (program_module_id)만 더할 뿐이라, 복제도 동기화도 없이 두 화면이 한 원장을 본다.
 * 목록·행·미리보기는 자료 관리 패널과 공용 `MaterialList`를 그대로 쓴다.
 */
export function ModuleFileModal({
  programId,
  moduleId,
  title,
  onClose,
}: {
  programId: string
  moduleId: string
  /** 모달 제목(모듈명). */
  title: string
  onClose: () => void
}) {
  // 드롭존이 소유한 파일 입력을 하단 '업로드' 버튼에서도 열기 위한 핸들.
  const openPicker = useRef<(() => void) | null>(null)
  const { data: materials = [], isLoading } = useMaterials('program', programId, moduleId)
  const upload = useUploadMaterial('program', programId, moduleId)
  const remove = useDeleteMaterial('program', programId)

  const busy = upload.isPending

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={title}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={() => openPicker.current?.()}>
            {busy ? '업로드 중…' : '업로드'}
          </Button>
          <Button onClick={onClose}>닫기</Button>
        </>
      }
    >
      <div className="space-y-3">
        <MaterialDropZone onFiles={(files) => files.forEach((f) => upload.mutate(f))} openRef={openPicker} />
        {upload.isError && (
          <p className="text-caption text-danger">업로드에 실패했습니다. 다시 시도해 주세요.</p>
        )}
        <MaterialList
          materials={materials}
          loading={isLoading}
          onDelete={(id) => remove.mutate(id)}
          deletingId={remove.isPending ? remove.variables : undefined}
          emptyText="등록된 파일이 없습니다. 위 영역에 파일을 끌어다 놓거나 업로드를 누르세요."
          pageSize={8}
        />
        <p className="text-caption text-gray-600">
          여기에 올린 파일은 이 사업의 자료 관리에도 함께 표시됩니다.
        </p>
      </div>
    </Modal>
  )
}
