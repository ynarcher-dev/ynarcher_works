import { Button, Input, Modal, Spinner, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import {
  useApprovalDeletePreview,
  useDeleteApproval,
} from '@/features/approval/approvalDraftApi'

/**
 * 따라쓸 문구 — **고정 문구이지 문서 제목이 아니다.** 제목을 치게 하면 길거나 비어 있을 때
 * 계속 실패하고, 확인하려는 것은 정확한 타자가 아니라 의식적 동의다(모듈 삭제·명부 빼기와
 * 같은 규칙). 무엇을 지우는지는 위의 제목과 경고가 답한다.
 */
const CONFIRM_PHRASE = '삭제합니다'

interface ApprovalDeleteModalProps {
  open: boolean
  onClose: () => void
  /** 지운 뒤 갈 곳(문서함). 문서가 사라지므로 상세에 머무를 수 없다. */
  onDeleted: () => void
  documentId: string
  title: string
  docNo: string | null
  /** 상신 이력이 있는 문서인가 — 결재자의 도장과 의견이 함께 사라진다는 뜻이다. */
  hadSubmission: boolean
}

/**
 * 기안 삭제 확인창 — 물리 삭제다.
 *
 * 따라쓰기를 **언제나** 요구한다. 한 번도 상신하지 않은 임시저장이라면 가벼운 일이지만,
 * 조건부로 두면 그 칸이 어떤 때는 뜨고 어떤 때는 안 뜨는 창이 되어 무엇을 뜻하는지 매번
 * 다시 읽어야 한다(명부 빼기 창이 먼저 밟은 길).
 *
 * 첨부·의견 건수는 창이 열릴 때 서버에 묻는다. 막지 않는 것과 말없이 지우는 것은 다르므로,
 * 남는 것과 사라지는 것을 지우기 전에 밝힌다.
 */
export function ApprovalDeleteModal({
  open,
  onClose,
  onDeleted,
  documentId,
  title,
  docNo,
  hadSubmission,
}: ApprovalDeleteModalProps) {
  const toast = useToast()
  const remove = useDeleteApproval()
  const preview = useApprovalDeletePreview(documentId, open)
  const [typed, setTyped] = useState('')

  const close = () => {
    setTyped('')
    onClose()
  }

  if (!open) return null

  const ready = typed.trim() === CONFIRM_PHRASE && !preview.isLoading
  const counts = preview.data

  const submit = async () => {
    try {
      await remove.mutateAsync(documentId)
      toast.show('기안을 삭제했습니다.', 'success')
      setTyped('')
      onDeleted()
    } catch {
      // 근거 품의로 걸린 문서는 서버가 막는다 — 화면이 미리 알 수 없는 사실이라 여기서 전한다.
      toast.show(
        '삭제할 수 없습니다. 이 문서를 근거 품의로 가리키는 문서가 있는지 확인하세요.',
        'danger',
      )
    }
  }

  return (
    <Modal
      dismissible={false}
      open={open}
      onClose={close}
      title="기안 삭제"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={remove.isPending}>
            닫기
          </Button>
          <Button
            variant="danger"
            onClick={() => void submit()}
            disabled={remove.isPending || !ready}
          >
            {remove.isPending ? '삭제 중…' : '삭제'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-radius-md border border-danger-border bg-danger-subtle px-3 py-2">
          <p className="text-body-sm font-semibold text-gray-900">
            {docNo ? `${docNo} · ` : ''}
            {title || '제목 없는 문서'}
          </p>
          <p className="mt-1 text-body-sm text-gray-700">
            문서를 <b>완전히 삭제합니다. 되돌릴 수 없습니다.</b>
          </p>
        </div>

        {hadSubmission && (
          <p className="text-body-sm text-gray-700">
            이 문서는 한 번 상신된 적이 있습니다. <b>결재자의 도장과 의견도 함께 사라집니다.</b>{' '}
            남겨 두려면 삭제하지 말고 기안함에 그대로 두십시오.
          </p>
        )}

        {preview.isLoading ? (
          <div className="flex items-center gap-2 text-body-sm text-gray-600">
            <Spinner /> 함께 정리될 자료를 확인하는 중…
          </div>
        ) : preview.isError ? (
          <p className="text-body-sm text-danger">
            함께 정리될 자료를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        ) : counts && (counts.attachments > 0 || counts.comments > 0) ? (
          <div className="rounded-radius-md border border-warning-border bg-warning-subtle px-3 py-2">
            <p className="text-body-sm text-gray-900">
              {counts.attachments > 0 && (
                <>
                  첨부 <b>{counts.attachments}건</b>
                </>
              )}
              {counts.attachments > 0 && counts.comments > 0 && ' · '}
              {counts.comments > 0 && (
                <>
                  의견 <b>{counts.comments}건</b>
                </>
              )}
              이 함께 내려갑니다.
            </p>
          </div>
        ) : null}

        <label className="block">
          <span className="text-body-sm text-gray-700">
            확인을 위해 <b>{CONFIRM_PHRASE}</b>를 입력하세요.
          </span>
          <Input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={CONFIRM_PHRASE}
            className="mt-1"
            disabled={remove.isPending}
          />
        </label>
      </div>
    </Modal>
  )
}
