import { Button, Card, Input, TextArea, useToast } from '@ynarcher/ui'
import { useRef, useState } from 'react'
import { MaterialDropZone } from '@/features/networks/MaterialDropZone'
import { MaterialList } from '@/features/networks/MaterialList'
import {
  useDeleteMaterial,
  useMaterials,
  useUpdateMaterialMeta,
  useUploadMaterial,
  type Material,
} from '@/features/networks/materialHooks'

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
 * 파일마다 표시명·설명을 붙일 수 있다(URL첨부와 같은 축). 파일명은 올린 사람의 사정을
 * 그대로 달고 오므로 받는 사람에게 "이게 무엇인지"를 말해 주지 못한다. 다만 업로드를 막지
 * 않기 위해 올린 뒤에 붙인다 — 여러 파일을 한꺼번에 끌어다 놓는 흐름을 폼이 가로막으면
 * 정작 파일이 안 올라간다.
 */
export function FilePanel({
  programId,
  moduleId,
}: {
  programId: string
  moduleId: string
}) {
  // 드롭존이 소유한 파일 입력을 카드 헤더 '업로드' 버튼에서도 열기 위한 핸들.
  const openPicker = useRef<(() => void) | null>(null)
  const { data: materials = [], isLoading } = useMaterials('program', programId, moduleId)
  const upload = useUploadMaterial('program', programId, moduleId)
  const remove = useDeleteMaterial('program', programId)
  // 표시명·설명을 고치는 중인 파일(목록과 자리를 바꾼다).
  const [editing, setEditing] = useState<Material | null>(null)

  const busy = upload.isPending

  return (
    <Card
      title="파일"
      count={materials.length}
      actions={
        editing ? undefined : (
          <Button variant="secondary" disabled={busy} onClick={() => openPicker.current?.()}>
            {busy ? '업로드 중…' : '업로드'}
          </Button>
        )
      }
    >
      {editing ? (
        <FileMetaForm
          key={editing.id}
          programId={programId}
          material={editing}
          onDone={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="space-y-3">
          <MaterialDropZone
            onFiles={(files) => files.forEach((f) => upload.mutate(f))}
            openRef={openPicker}
          />
          {upload.isError && (
            <p className="text-caption text-danger">업로드에 실패했습니다. 다시 시도해 주세요.</p>
          )}
          {/* 설명은 여기서 붙이고 고치는 값이라 이 목록에서만 펼쳐 보인다(상세 우측 자료 관리 패널은 숨김). */}
          <MaterialList
            materials={materials}
            loading={isLoading}
            onEdit={(m) => setEditing(m)}
            onDelete={(id) => remove.mutate(id)}
            deletingId={remove.isPending ? remove.variables : undefined}
            emptyText="등록된 파일이 없습니다. 위 영역에 파일을 끌어다 놓거나 업로드를 누르세요."
            pageSize={8}
            showDescription
          />
          <p className="text-caption text-gray-600">
            여기에 올린 파일은 이 사업의 자료 관리에도 함께 표시됩니다.
          </p>
        </div>
      )}
    </Card>
  )
}

/** 파일 1건의 표시명·설명 편집. 파일 자체(파일명·저장 경로)는 바꾸지 않는다. */
function FileMetaForm({
  programId,
  material,
  onDone,
  onCancel,
}: {
  programId: string
  material: Material
  onDone: () => void
  onCancel: () => void
}) {
  const toast = useToast()
  const update = useUpdateMaterialMeta('program', programId)
  const [label, setLabel] = useState(material.label ?? '')
  const [description, setDescription] = useState(material.description ?? '')

  const submit = async () => {
    if (update.isPending) return
    try {
      await update.mutateAsync({
        id: material.id,
        label: label.trim() || null,
        description: description.trim() || null,
      })
      onDone()
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-caption font-semibold text-gray-600">표시명</label>
        <Input
          autoFocus
          placeholder={material.file_name}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <p className="text-caption text-gray-600">
          비워 두면 파일명({material.file_name})이 그대로 표시됩니다.
        </p>
      </div>
      <div className="space-y-1.5">
        <label className="text-caption font-semibold text-gray-600">설명</label>
        <TextArea
          rows={2}
          placeholder="이 파일이 무엇인지 한 줄로 적어 주세요."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={update.isPending}>
          취소
        </Button>
        <Button onClick={() => void submit()} disabled={update.isPending}>
          {update.isPending ? '저장 중…' : '저장'}
        </Button>
      </div>
    </div>
  )
}
