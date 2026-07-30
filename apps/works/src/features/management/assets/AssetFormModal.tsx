import { Button, Modal } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useEmployees } from '@/features/hub/hooks'
import { AssetFormFields } from '@/features/management/assets/AssetFormFields'
import {
  draftFromAsset,
  emptyDraft,
  toAssetInput,
  validateDraft,
  type AssetDraft,
  type AssetFormError,
} from '@/features/management/assets/assetForm'
import {
  useAssetItemTypes,
  type Asset,
  type AssetInput,
} from '@/features/management/assets/assetsApi'
import type { Branch } from '@/features/office/branches/branchesApi'

interface AssetFormModalProps {
  open: boolean
  /** 있으면 수정, 없으면 등록. */
  asset?: Asset
  /** 등록 시 미리 고를 지사(지금 보고 있는 지사 탭). */
  defaultBranchId: string
  branches: Branch[]
  busy: boolean
  onClose: () => void
  onSubmit: (v: AssetInput) => void
  /** 수정일 때만 쓰는 비활성화(soft delete). 폐기와는 다른 축이다. */
  onDeactivate?: () => void
}

/**
 * 자산 등록·수정 모달. 등록과 수정은 같은 폼이며 제목과 푸터만 갈린다.
 *
 * 지금 보고 있는 지사 탭이 등록 시 기본 지사가 된다 — 지사를 보다가 등록을 누르는 흐름에서
 * 방금 보던 지사를 다시 고르게 하지 않는다(고칠 수는 있게 셀렉트로 남긴다).
 */
export function AssetFormModal({
  open,
  asset,
  defaultBranchId,
  branches,
  busy,
  onClose,
  onSubmit,
  onDeactivate,
}: AssetFormModalProps) {
  const editing = Boolean(asset)
  const { data: employees } = useEmployees()
  const { data: itemTypes } = useAssetItemTypes()
  const [draft, setDraft] = useState<AssetDraft>(() => emptyDraft(defaultBranchId))
  const [error, setError] = useState<AssetFormError | null>(null)

  // 열릴 때마다 대상에 맞춰 초기화한다 — 닫았던 폼의 값이 다음 등록에 남으면 안 된다.
  useEffect(() => {
    if (!open) return
    setDraft(asset ? draftFromAsset(asset) : emptyDraft(defaultBranchId))
    setError(null)
  }, [open, asset, defaultBranchId])

  const change = (next: AssetDraft) => {
    setDraft(next)
    // 고치는 중에 빨간 글씨가 남아 있으면 무엇을 고쳤는지 알 수 없다 — 값이 바뀌면 지운다.
    if (error) setError(null)
  }

  const submit = () => {
    const found = validateDraft(draft)
    if (found) return setError(found)
    onSubmit(toAssetInput(draft))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? '자산 수정' : '자산 등록'}
      size="lg"
      footer={
        <>
          {/*
            비활성화는 저장과 성격이 다른 일(이 행을 목록에 둘지)이라 확인/취소와 같은 무리에 두지
            않고 반대쪽 끝으로 민다 — 지사 폼과 같은 규칙이다.
          */}
          {editing && onDeactivate && (
            <Button
              variant="outline"
              onClick={onDeactivate}
              disabled={busy}
              className="mr-auto text-danger hover:bg-danger-subtle hover:text-danger"
            >
              비활성화
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button onClick={submit} disabled={busy || !draft.name.trim()}>
            {busy ? '저장 중…' : editing ? '저장' : '등록'}
          </Button>
        </>
      }
    >
      <AssetFormFields
        draft={draft}
        onChange={change}
        branches={branches}
        employees={employees ?? []}
        itemTypes={itemTypes ?? []}
        error={error}
      />
    </Modal>
  )
}
