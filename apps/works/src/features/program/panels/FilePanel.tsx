import { Card } from '@ynarcher/ui'
import { MaterialDropZone } from '@/features/networks/MaterialDropZone'
import { MaterialList } from '@/features/networks/MaterialList'
import {
  useDeleteMaterial,
  useMaterials,
  useUploadMaterial,
} from '@/features/networks/materialHooks'
import { useProgramWorkspace } from '@/features/program/workspace'

/**
 * 파일첨부 모듈(전체 화면). GUEST의 파일첨부 메뉴와 **같은 구성**(파일 목록)이며, 차이는
 * 편집 가능 여부뿐이다 — WORKS에서 올려 두고, 공유 범위를 올리면 GUEST가 같은 목록을
 * 내려받기 전용으로 본다.
 *
 * 여기서 올린 파일은 사업 상세의 자료 관리 패널에도 **같은 행**으로 나타난다. 첨부 대상은
 * 어디까지나 사업(target_type='program', target_id=사업id)이고 모듈은 귀속 표시
 * (program_module_id)만 더할 뿐이라, 복제도 동기화도 없이 두 화면이 한 원장을 본다.
 * 목록·행·미리보기는 자료 관리 패널과 공용 `MaterialList`를 그대로 쓴다.
 *
 * ## 표시명·설명을 손으로 붙이는 자리는 없다 (2026-09-10)
 *
 * 파일마다 표시명·설명을 붙이는 폼이 여기 있었으나 걷었다. 파일의 이름은 **파일명 하나**이며,
 * 그것 말고 부르는 이름을 하나 더 두면 목록의 행이 두 줄이 되어(표시명 위, 파일명 아래) 같은
 * 자리에 사는 행끼리 높이가 달라지고, 받는 사람이 보는 이름과 실제로 받는 파일의 이름이
 * 갈린다. 이름이 파일명과 달라야 하는 자료라면 고칠 것은 표시명이 아니라 올리는 파일의
 * 이름이다. 링크에는 여전히 표시명이 붙지만 그것은 사람이 적는 값이 아니라 주소에서 읽어 온
 * 제목이다(`materialHooks.addMaterialLink`).
 */
export function FilePanel({ programId, moduleId }: { programId: string; moduleId: string }) {
  const { entityNoun } = useProgramWorkspace()
  const { data: materials = [], isLoading } = useMaterials('program', programId, moduleId)
  const upload = useUploadMaterial('program', programId, moduleId)
  const remove = useDeleteMaterial('program', programId)

  const busy = upload.isPending

  return (
    <Card
      title="파일"
      count={materials.length}
      help={`여기에 올린 파일은 이 ${entityNoun}의 자료 관리에도 함께 표시됩니다.`}
    >
      <div className="space-y-3">
        {/* 파일을 놓는 자리는 이 상자 하나다(헤더 '업로드' 버튼은 2026-09-05에 걷었다). */}
        <MaterialDropZone onFiles={(files) => files.forEach((f) => upload.mutate(f))} busy={busy} />
        {upload.isError && (
          <p className="text-caption text-danger">업로드에 실패했습니다. 다시 시도해 주세요.</p>
        )}
        {/* 설명은 편집 폼을 걷기 전에 적힌 값만 남아 있다. 지우지 않고 그대로 펼쳐 보인다 —
            담당자가 적어 둔 문장을 화면에서만 감추면 그 자료가 무엇인지 답하던 줄이 사라진다. */}
        <MaterialList
          materials={materials}
          loading={isLoading}
          onDelete={(id) => remove.mutate(id)}
          deletingId={remove.isPending ? remove.variables : undefined}
          emptyText="등록된 파일이 없습니다. 위 영역에 파일을 끌어다 놓거나 눌러서 첨부하세요."
          pageSize={8}
          showDescription
        />
      </div>
    </Card>
  )
}
