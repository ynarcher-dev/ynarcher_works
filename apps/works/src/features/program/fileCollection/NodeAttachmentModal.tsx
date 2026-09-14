import { Banner, Modal, cardText } from '@ynarcher/ui'
import { FILE_COLLECTION_NODE_ATTACHMENT_TYPE } from '@ynarcher/master-data'
import { MaterialDropZone } from '@/features/networks/MaterialDropZone'
import { MaterialList } from '@/features/networks/MaterialList'
import {
  useDeleteMaterial,
  useMaterials,
  useUploadMaterial,
} from '@/features/networks/materialHooks'

/**
 * 문항 하나의 **첨부파일**(담당자가 건네는 양식·견본)을 붙이고 내리는 창.
 *
 * 방향이 제출물과 반대다 — 게스트가 올리는 파일은 사람마다 다르고 서로 못 보지만, 여기 붙는
 * 것은 담당자가 배정된 **전원에게** 같은 것을 건네는 자료다. 그래서 원장도 제출물의 전용
 * 표가 아니라 공용 첨부(`attachments`, `target_type='file_collection_node'`)를 쓴다. 업로드·
 * 목록·다운로드·소프트 삭제는 자료 관리 패널과 **같은 부품·같은 통로**이며, 이 파일이 더하는
 * 것은 대상을 문항으로 못 박는 일과 이 자리에서만 하는 말뿐이다.
 *
 * 링크 붙이기는 두지 않는다 — 여기서 건네는 것은 "이 서식을 채워 내라"는 실물이고, 참고할
 * 주소는 문항 안내 문구가 받는다(같은 자리에 두 종류를 세우면 받는 쪽 화면에서 내려받을 수
 * 없는 줄이 섞인다).
 *
 * **저장되지 않은 줄에는 열리지 않는다.** 첨부는 마디 id에 붙으므로 구성 저장 전에는 붙일
 * 자리가 없다 — 그 판정은 이 창을 여는 쪽(`CollectionStructureTab`)이 갖는다.
 */
export function NodeAttachmentModal({
  open,
  moduleId,
  nodeId,
  nodeTitle,
  canWrite,
  onClose,
}: {
  open: boolean
  moduleId: string
  /** 자료를 붙일 문항의 원장 id. */
  nodeId: string
  nodeTitle: string
  /** 쓰기 권한이 없으면 목록·다운로드만 선다(서버도 같은 판정을 한다). */
  canWrite: boolean
  onClose: () => void
}) {
  const { data: materials, isLoading } = useMaterials(
    FILE_COLLECTION_NODE_ATTACHMENT_TYPE,
    nodeId,
    moduleId,
  )
  const upload = useUploadMaterial(FILE_COLLECTION_NODE_ATTACHMENT_TYPE, nodeId, moduleId)
  const remove = useDeleteMaterial(FILE_COLLECTION_NODE_ATTACHMENT_TYPE, nodeId)
  const list = materials ?? []

  return (
    <Modal open={open} onClose={onClose} title="첨부파일" size="lg">
      <div className="space-y-3">
        {/* 어느 문항의 자료인지 먼저 답한다 — 표에서 클립을 눌러 들어온 자리라 창 제목만으로는
            방금 누른 줄이 맞는지 확인할 길이 없다. */}
        <p className={`break-words [overflow-wrap:anywhere] ${cardText.subhead}`}>{nodeTitle}</p>

        {canWrite ? (
          <>
            <MaterialDropZone onFiles={(files) => files.forEach((f) => upload.mutate(f))} busy={upload.isPending} />
            {upload.isError && (
              <p className="text-caption text-danger">업로드에 실패했습니다. 다시 시도해 주세요.</p>
            )}
            {/* 받는 쪽에 곧바로 보인다는 사실을 적는다 — 제출물과 달리 여기에는 '내보내기'
                단계가 없어서, 올리는 순간이 곧 배포되는 순간이다. */}
            <p className="text-caption text-gray-600">
              올린 자료는 이 문항을 받는 사람 모두에게 곧바로 보입니다(모듈이 공개된 뒤).
            </p>
          </>
        ) : (
          <Banner tone="info">읽기 권한이라 자료를 붙이거나 내릴 수 없습니다.</Banner>
        )}

        <MaterialList
          materials={list}
          loading={isLoading}
          onDelete={canWrite ? (id) => remove.mutate(id) : undefined}
          deletingId={remove.isPending ? remove.variables : undefined}
          emptyText="이 문항에 붙인 자료가 없습니다."
        />
      </div>
    </Modal>
  )
}
