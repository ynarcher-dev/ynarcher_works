import { Button } from '@ynarcher/ui'

/**
 * 명부에서 행을 고른 뒤에만 서는 줄 — 고른 건수와, 그 선택에 대고 할 수 있는 일.
 *
 * 툴바에 상시로 두지 않는 이유는 **비활성 버튼이 이유를 말하지 못해서**다. 종전에는
 * 액션 넷이 늘 회색으로 서 있었고 켜지는 조건이 저마다 달라(1건만·계정 있는 행만·N건),
 * 처음 들어온 담당자에게는 규칙이 추측 대상이었다. 고른 뒤에 뜨면 "지금 무엇에 대고
 * 무엇을 할 수 있는가"가 한 줄로 읽힌다.
 *
 * 여기 서는 것은 **선택한 행에 걸리는 일**뿐이다. 사업 전체에 걸리는 '로그인 가능 기간'은
 * 선택과 무관하므로 툴바에 남는다 — 같은 줄에 섞으면 고른 행에만 걸린다고 읽힌다.
 */
export function ParticipantSelectionBar({
  count,
  accountCount,
  onOpen,
  onResetPassword,
  onBlock,
  onClear,
  busy,
}: {
  /** 고른 행 수. 0이면 이 줄 자체를 렌더하지 않는다. */
  count: number
  /** 고른 것 중 계정이 있는 대상 수 — 재설정 안내가 걸리는 대상이다. */
  accountCount: number
  onOpen: () => void
  onResetPassword: () => void
  onBlock: () => void
  onClear: () => void
  busy: boolean
}) {
  if (count === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-radius-md border border-brand-200 bg-brand-50 px-3 py-2">
      <span className="text-body font-semibold text-gray-900">{count}건 선택</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={onOpen} disabled={busy}>
          로그인 열기
        </Button>
        {/*
          계정이 없는 대상은 보낼 곳이 없다. 버튼을 지우지 않고 사유를 옆에 적는 이유는,
          사라진 버튼은 "왜 없지"를 남기고 회색 버튼은 "무엇이 모자란지"를 답하기 때문이다.
        */}
        <Button variant="outline" onClick={onResetPassword} disabled={busy || accountCount === 0}>
          비밀번호 재설정 안내
        </Button>
        {accountCount === 0 && (
          <span className="text-caption text-gray-600">계정이 있는 대상이 없습니다</span>
        )}
        <Button variant="outline-danger" onClick={onBlock} disabled={busy}>
          이 사업 차단
        </Button>
        <Button variant="ghost" onClick={onClear} disabled={busy}>
          선택 해제
        </Button>
      </div>
    </div>
  )
}
