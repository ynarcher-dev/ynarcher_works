import {
  Banner,
  Button,
  Checkbox,
  Field,
  Input,
  Modal,
  Select,
  TextArea,
  useToast,
} from '@ynarcher/ui'
import {
  nextSortOrder,
  parentFolderOptions,
  type FileCollectionNodeDto,
  type FileCollectionNodeType,
} from '@ynarcher/master-data'
import { useState } from 'react'
import { useSaveNode } from '@/features/program/fileCollection/fileCollectionHooks'
import { failureText } from '@/lib/failureText'

export interface NodeFormTarget {
  /** 고칠 마디. 신규면 `null`. */
  node: FileCollectionNodeDto | null
  /** 신규일 때의 종류와 기본 부모. */
  nodeType: FileCollectionNodeType
  parentId: string | null
}

/**
 * 폴더·문항 한 칸을 세우거나 고치는 창.
 *
 * 부모 선택에서 **자기 자신·자기 자손·문항은 목록에 서지 않는다** — 서버 트리거가 막는 것과
 * 같은 조건이며(`fc_node_guard`), 화면이 먼저 걸러야 담당자가 눌러 본 뒤에 거절을 읽지 않는다.
 *
 * 수정 저장에는 **읽은 시점의 `updated_at`을 함께 보낸다.** 다른 사람이 먼저 고쳤으면 서버가
 * 거절하고(40001) 그 사실이 그대로 토스트에 뜬다 — 덮어쓰고 나서 알아채는 것보다 낫다.
 */
export function NodeFormModal({
  open,
  target,
  moduleId,
  collectionId,
  nodes,
  onClose,
}: {
  open: boolean
  target: NodeFormTarget
  moduleId: string
  collectionId: string
  nodes: readonly FileCollectionNodeDto[]
  onClose: () => void
}) {
  const editing = target.node
  const toast = useToast()
  const save = useSaveNode(moduleId)

  const [nodeType, setNodeType] = useState<FileCollectionNodeType>(
    editing?.node_type ?? target.nodeType,
  )
  const [parentId, setParentId] = useState<string>(
    (editing ? editing.parent_id : target.parentId) ?? '',
  )
  const [title, setTitle] = useState(editing?.title ?? '')
  const [guide, setGuide] = useState(editing?.guide ?? '')
  const [isRequired, setIsRequired] = useState(editing?.is_required ?? false)

  const folders = parentFolderOptions(nodes, editing?.id ?? null)
  const trimmed = title.trim()
  const canSubmit = trimmed.length > 0 && !save.isPending

  const submit = () => {
    if (!canSubmit) return
    save.mutate(
      {
        collectionId,
        nodeId: editing?.id ?? null,
        parentId: parentId || null,
        nodeType,
        title: trimmed,
        guide: guide.trim() || null,
        isRequired: nodeType === 'QUESTION' ? isRequired : false,
        // 신규는 형제 끝에 붙이고, 수정은 지금 자리를 지킨다 — 이름만 고쳤는데 순서가
        // 바뀌면 담당자가 방금 짠 목록이 흐트러진다.
        sortOrder: editing ? editing.sort_order : nextSortOrder(nodes, parentId || null),
        expectedUpdatedAt: editing?.updated_at ?? null,
      },
      {
        onSuccess: () => {
          toast.show(editing ? '항목을 수정했습니다.' : '항목을 추가했습니다.', 'success')
          onClose()
        },
        onError: (e) => toast.show(failureText(e, '저장에 실패했습니다.'), 'danger'),
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? '항목 수정' : nodeType === 'FOLDER' ? '폴더 추가' : '문항 추가'}
      help="폴더는 문항을 묶기만 하고, 파일을 받는 칸은 문항입니다. 깊이 제한은 없습니다."
      size="md"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            취소
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {save.isPending ? '저장 중…' : '저장'}
          </Button>
        </div>
      }
    >
      <div className="min-w-0 space-y-3">
        <Field label="종류" required>
          <Select
            value={nodeType}
            onChange={(e) => setNodeType(e.target.value as FileCollectionNodeType)}
          >
            <option value="FOLDER">폴더(묶음)</option>
            <option value="QUESTION">문항(파일을 받는 칸)</option>
          </Select>
        </Field>

        <Field
          label="상위 폴더"
          hint="비우면 최상위에 섭니다. 자기 자신과 그 아래 항목, 문항은 상위로 고를 수 없습니다."
        >
          <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">(최상위)</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.path}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="이름" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={nodeType === 'FOLDER' ? '예: 재무 자료' : '예: 최근 3년 재무제표'}
            maxLength={200}
          />
        </Field>

        <Field label="안내" hint="받는 사람이 이 칸에서 읽을 설명입니다.">
          <TextArea
            value={guide}
            onChange={(e) => setGuide(e.target.value)}
            rows={3}
            maxLength={2000}
          />
        </Field>

        {nodeType === 'QUESTION' && (
          <Checkbox
            checked={isRequired}
            onChange={(e) => setIsRequired(e.target.checked)}
            label="필수 문항"
          />
        )}

        {editing && editing.node_type === 'FOLDER' && nodeType === 'QUESTION' && (
          <Banner tone="warning">
            아래에 항목이 있는 폴더는 문항으로 바꿀 수 없습니다. 먼저 아래 항목을 옮기거나
            지워 주세요.
          </Banner>
        )}
      </div>
    </Modal>
  )
}
