import { Button, Input, Modal, Select } from '@ynarcher/ui'
import type { Tag } from '@/features/admin/hooks'
import type { TagConfig } from '@/features/admin/tagConfig'

interface TagEditModalProps {
  /** 수정 대상. null이면 닫힌 상태. */
  tag: Tag | null
  noun: string
  /** 2뎁스 태그의 부모 설정(예: 국가 태그의 권역). 없으면 이름만 수정한다. */
  parent?: TagConfig['parent']
  /** 부모 선택지(2뎁스 전용). */
  parentTags?: Tag[]
  name: string
  onNameChange: (name: string) => void
  parentId: string
  onParentIdChange: (id: string) => void
  onClose: () => void
  onSubmit: () => void
  pending?: boolean
}

/** 태그 수정 모달(이름 + 2뎁스 태그의 부모 선택). TagAdminPanel 전용. */
export function TagEditModal({
  tag,
  noun,
  parent,
  parentTags,
  name,
  onNameChange,
  parentId,
  onParentIdChange,
  onClose,
  onSubmit,
  pending,
}: TagEditModalProps) {
  return (
    <Modal
      open={Boolean(tag)}
      onClose={onClose}
      title={`${noun} 태그 수정`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={onSubmit} disabled={!name.trim() || pending}>
            수정
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {parent && (
          <Select value={parentId} onChange={(e) => onParentIdChange(e.target.value)}>
            <option value="">{parent.noun} 선택</option>
            {parentTags?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
        <Input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit()
          }}
        />
      </div>
    </Modal>
  )
}
