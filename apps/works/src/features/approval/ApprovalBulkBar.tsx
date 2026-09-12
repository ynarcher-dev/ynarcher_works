import { Banner, Button, Modal, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { useBulkApproveApprovals, useMarkApprovalRead } from '@/features/approval/approvalApi'
import type { ApprovalBulkTarget } from '@/features/approval/model'

interface ApprovalBulkBarProps {
  /** 고른 줄들의 처리 대상. 비면 이 줄 자체를 렌더하지 않는다. */
  targets: ApprovalBulkTarget[]
  uid: string
  /** 처리 후 선택을 비운다 — 목록에서 사라진 줄에 대한 선택이 남지 않게. */
  onDone: () => void
}

/**
 * 선택 요약 줄 + 일괄 승인 / 일괄 확인.
 *
 * 여는 것은 둘뿐이고 근거는 `bulkTargetFor`에 적었다(보완·반려는 사유가 문서마다 다르다).
 *
 * **두 버튼은 자기 대상이 있을 때만 선다.** 고른 다섯 줄 중 셋만 내 차례일 수 있으므로
 * 건수를 버튼에 적는다 — 선택 수와 처리 수가 다를 수 있다는 사실을 누르기 전에 말하지
 * 않으면, 다섯을 고르고 셋이 처리됐다는 결과만 뒤늦게 받는다.
 *
 * 승인만 한 번 묻는다. 확인은 "읽었다"는 내 표시라 문서의 흐름을 바꾸지 않지만, 승인은
 * 마지막 한 표면 문서를 끝낸다(되돌리려면 건마다 회수해야 한다).
 */
export function ApprovalBulkBar({ targets, uid, onDone }: ApprovalBulkBarProps) {
  const toast = useToast()
  const approve = useBulkApproveApprovals()
  const markRead = useMarkApprovalRead()
  const [confirming, setConfirming] = useState(false)

  const lineIds = targets.map((t) => t.approveLineId).filter((id): id is string => Boolean(id))
  const confirmIds = targets.filter((t) => t.needsConfirm).map((t) => t.documentId)
  const busy = approve.isPending || markRead.isPending

  if (!targets.length) return null

  const submitApprove = async () => {
    try {
      const { done, failed } = await approve.mutateAsync(lineIds)
      if (done) {
        toast.show(
          `${done}건을 승인했습니다.` +
            (failed > 0 ? ` ${failed}건은 처리하지 못했습니다(결재 상태가 바뀌었을 수 있습니다).` : ''),
          failed > 0 ? 'warning' : 'success',
        )
      } else {
        toast.show('승인하지 못했습니다. 결재 상태와 권한을 확인하세요.', 'danger')
      }
      setConfirming(false)
      onDone()
    } catch {
      toast.show('일괄 승인에 실패했습니다.', 'danger')
    }
  }

  const submitConfirm = () => {
    markRead.mutate(
      { documentIds: confirmIds, userId: uid },
      {
        onSuccess: () => {
          toast.show(`${confirmIds.length}건을 확인했습니다.`, 'success')
          onDone()
        },
        onError: () => toast.show('확인 처리에 실패했습니다.', 'danger'),
      },
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-radius-md border border-brand-200 bg-brand-50 px-3 py-2">
        <span className="text-body font-semibold text-gray-900">{targets.length}건 선택</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {lineIds.length > 0 && (
            <Button onClick={() => setConfirming(true)} disabled={busy}>
              일괄 승인 {lineIds.length}건
            </Button>
          )}
          {confirmIds.length > 0 && (
            <Button variant="outline" onClick={submitConfirm} disabled={busy}>
              일괄 확인 {confirmIds.length}건
            </Button>
          )}
        </div>
      </div>

      <Modal
        dismissible={false}
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`일괄 승인 — ${lineIds.length}건`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              취소
            </Button>
            <Button onClick={() => void submitApprove()} disabled={busy}>
              승인
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Banner tone="info">
            지금 내 차례인 {lineIds.length}건을 승인합니다. 남은 처리가 없는 문서는 이 승인으로
            완료됩니다.
          </Banner>
          <p className="text-body-sm text-gray-700">
            의견을 남기거나 보완을 요청·반려하려면 문서를 열어 한 건씩 처리하세요.
          </p>
        </div>
      </Modal>
    </>
  )
}
