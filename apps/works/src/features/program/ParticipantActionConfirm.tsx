import { Button, Modal } from '@ynarcher/ui'
import type { ReactNode } from 'react'

/** 확인이 필요한 명부 일괄 작업. null이면 창을 닫는다. */
export type ParticipantAction = 'open' | 'block' | 'unblock' | 'reset'

/**
 * 명부 일괄 작업 확인창.
 *
 * 셋 다 **밖으로 나가거나 즉시 끊는 일**이라 확인을 받는다 — 로그인 열기와 재설정 안내는
 * 게스트의 연락처로 메시지가 나가고(보낸 것은 되돌릴 수 없다), 차단은 접속 중인 세션까지
 * 그 자리에서 무효화한다. 저장 버튼 하나로 조용히 끝나면 담당자는 무엇이 나갔는지 사후에만
 * 안다.
 *
 * 따라쓰기까지 요구하지 않는 것은 되돌릴 수 있는 작업이기 때문이다(닫은 문은 다시 연다).
 * 되돌릴 수 없는 삭제에만 고정 문구를 치게 한다 — 모든 창이 타자를 요구하면 그 요구가
 * 의식적 동의가 아니라 통과 절차가 된다.
 */
export function ParticipantActionConfirm({
  action,
  count,
  onConfirm,
  onClose,
  busy,
}: {
  action: ParticipantAction | null
  /** 대상 건수 — 로그인 열기·차단은 고른 행 수, 재설정 안내는 계정 수다. */
  count: number
  onConfirm: () => void
  onClose: () => void
  busy: boolean
}) {
  if (!action) return null

  const spec: Record<
    ParticipantAction,
    { title: string; body: ReactNode; confirm: string; danger: boolean }
  > = {
    open: {
      title: '로그인 열기',
      body: (
        <>
          <b>{count}건</b>의 로그인을 열고 접속 안내를 각자의 연락처로 보냅니다. 계정이 없는
          대상은 이때 계정이 만들어집니다.
        </>
      ),
      confirm: '열고 안내 보내기',
      danger: false,
    },
    reset: {
      title: '비밀번호 재설정 안내',
      body: (
        <>
          계정 <b>{count}개</b>의 본인 연락처로 재설정 링크를 보냅니다. 비밀번호 값은 담당자
          화면에 오지 않습니다 — 계정 하나가 여러 사업을 열기 때문입니다.
        </>
      ),
      confirm: '안내 보내기',
      danger: false,
    },
    unblock: {
      title: '차단 해제',
      body: (
        <>
          <b>{count}건</b>의 차단을 풉니다. 상태는 <b>차단 전으로 돌아갑니다</b> — 이 사업에
          들어와 본 적이 있으면 <b>이용 중</b>, 초대만 되어 있었으면 <b>초대</b>입니다.
          안내는 다시 보내지 않습니다(다시 알리려면 `로그인 열기`를 쓰세요). 접근 기간이 이미
          지난 사업이라면 해제해도 들어오지 못하며, 그때는 <b>로그인 가능 기간</b>을 늘려야
          합니다.
        </>
      ),
      confirm: '차단 해제',
      danger: false,
    },
    block: {
      title: '이 사업 차단',
      body: (
        <>
          <b>{count}건</b>의 이 사업 접근을 막고, 접속 중인 세션도 즉시 끊습니다. 계정 자체는
          정지되지 않으므로 그 대상이 참여 중인 <b>다른 사업</b>은 그대로 열려 있습니다(계정
          정지는 ADMIN이 합니다).
        </>
      ),
      confirm: '차단',
      danger: true,
    },
  }

  const s = spec[action]

  return (
    <Modal
      open
      onClose={onClose}
      title={s.title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button variant={s.danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? '처리 중…' : s.confirm}
          </Button>
        </>
      }
    >
      <p className="text-body text-gray-700">{s.body}</p>
    </Modal>
  )
}
