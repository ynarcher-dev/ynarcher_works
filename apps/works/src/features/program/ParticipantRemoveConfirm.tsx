import { Button, Input, Modal, Spinner } from '@ynarcher/ui'
import { useState } from 'react'
import { useGuestHost } from '@/features/guest/host'
import { useRemovalPreview } from '@/features/program/participantAccessHooks'

/**
 * 따라쓸 문구 — **고정 문구이지 대상의 이름이 아니다.**
 *
 * 이름을 치게 하면 길거나 비어 있을 때 계속 실패하고, 여러 건을 한 번에 뺄 때는 무엇을 쳐야
 * 하는지조차 정해지지 않는다. 확인하려는 것은 정확한 타자가 아니라 의식적 동의다 —
 * 무엇을 빼는지는 위의 경고와 건수가 답한다(모듈 하드 딜리트와 같은 규칙).
 */
const CONFIRM_PHRASE = '삭제합니다'

/**
 * 명부에서 빼기 확인창 — **되돌릴 수 없는 하나만 따로 선다.**
 *
 * 나머지 일괄 작업(`ParticipantActionConfirm`)과 합치지 않은 이유는 성격이 갈리기 때문이다.
 * 저쪽 넷은 전부 되돌릴 수 있어(닫은 문은 다시 열고, 안내는 다시 보낸다) 확인 한 번으로
 * 충분하고, 이쪽은 행 자체가 사라진다. 한 창에 두면 따라쓰기 칸이 어떤 때는 뜨고 어떤 때는
 * 안 뜨는 창이 되어, 그 칸이 무엇을 뜻하는지 담당자가 매번 다시 읽어야 한다.
 *
 * **남는 기록의 건수를 창이 직접 묻는다.** 막지 않는 것과 말없이 지우는 것은 다르다 —
 * 지원서·질문·자료는 함께 지워지지 않고 그대로 남으므로, 그 사실을 지우기 전에 밝힌다.
 */
export function ParticipantRemoveConfirm({
  open,
  programId,
  participantIds,
  onConfirm,
  onClose,
  busy,
}: {
  open: boolean
  programId: string
  participantIds: string[]
  onConfirm: () => void
  onClose: () => void
  busy: boolean
}) {
  const { entityNoun } = useGuestHost()
  const [typed, setTyped] = useState('')
  const preview = useRemovalPreview(programId, participantIds, open)

  const close = () => {
    setTyped('')
    onClose()
  }

  if (!open) return null

  const residuals = preview.data ?? []
  const ready = typed.trim() === CONFIRM_PHRASE && !preview.isLoading

  return (
    <Modal
      open={open}
      onClose={close}
      title="명부에서 빼기"
      size="sm"
      dismissible={false}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={busy}>
            취소
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy || !ready}>
            {busy ? '빼는 중…' : '빼기'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-body text-gray-700">
          <b>{participantIds.length}건</b>을 이 {entityNoun}의 게스트 명부에서 뺍니다.{' '}
          <b>되돌릴 수 없습니다.</b> 접속 중이라면 그 자리에서 끊깁니다.
        </p>

        <p className="text-body text-gray-700">
          계정과 비밀번호는 지워지지 않으며, 같은 사람이 참여 중인 <b>다른 프로젝트/FUND는 그대로</b>
          입니다. 다시 담을 수는 있지만 그때는 새 줄이 되고 <b>이 {entityNoun}의 이용 기록은 이어지지
          않습니다.</b>
        </p>

        {/*
          건수는 삭제창이 열릴 때 서버에 묻는다. 조회 중에 창을 쓸 수 있게 두면 담당자가
          '남는 것 없음'으로 읽고 눌러 버린다 — 그래서 확인 버튼도 함께 잠근다.
        */}
        {preview.isLoading ? (
          <div className="flex items-center gap-2 text-body-sm text-gray-600">
            <Spinner /> 남는 기록을 확인하는 중…
          </div>
        ) : preview.isError ? (
          <p className="text-body-sm text-danger">
            남는 기록을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        ) : residuals.length > 0 ? (
          <div className="rounded-radius-md border border-warning-border bg-warning-subtle px-3 py-2">
            <p className="text-body-sm font-semibold text-gray-900">
              아래는 <b>함께 지워지지 않고 그대로 남습니다.</b>
            </p>
            <ul className="mt-1 space-y-0.5">
              {residuals.map((r) => (
                <li key={r.kind} className="text-body-sm text-gray-700">
                  {r.label} <b>{r.n}건</b>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-caption text-gray-600">
              누가 낸 것인지는 계정이 계속 답합니다. 다만 명부에서는 그 사람이 사라집니다.
            </p>
          </div>
        ) : null}

        <label className="block">
          <span className="text-body-sm text-gray-700">
            확인을 위해 <b>{CONFIRM_PHRASE}</b>를 입력하세요.
          </span>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            className="mt-1"
            disabled={busy}
          />
        </label>
      </div>
    </Modal>
  )
}
