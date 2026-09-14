import { Button } from '@ynarcher/ui'
import { useGuestHost } from '@/features/guest/host'

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
 *
 * **비밀번호 관련 버튼은 여기 서지 않는다.** 종전에는 `비밀번호 재설정 안내`가 이 줄에
 * 있었는데, 그 값은 사업의 것이 아니라 **계정의 것**이다 — 계정 하나가 여러 사업의 문을 열기
 * 때문에, 한 사업의 담당자가 누른 버튼이 그 게스트의 다른 팀 사업까지 함께 흔든다. 초기화는
 * 통합 GUEST 계정 관리(`/guest-accounts` 계정 상세 → `비밀번호 초기화`) 한 곳이 소유하며,
 * 초기값은 ADMIN이 중앙에서 정한 고정값이다.
 */
export function ParticipantSelectionBar({
  count,
  blockedCount,
  onOpen,
  onBlock,
  onUnblock,
  onRemove,
  onClear,
  busy,
}: {
  /** 고른 행 수. 0이면 이 줄 자체를 렌더하지 않는다. */
  count: number
  /** 고른 것 중 차단된 행 수 — 해제가 걸리는 대상이다. */
  blockedCount: number
  onOpen: () => void
  onBlock: () => void
  onUnblock: () => void
  onRemove: () => void
  onClear: () => void
  busy: boolean
}) {
  const { entityNoun } = useGuestHost()
  if (count === 0) return null

  // 차단과 해제는 서로 반대인 한 축이라 **고른 것에 실제로 걸리는 쪽만** 세운다. 둘을 늘
  // 나란히 두면 담당자가 매번 어느 쪽이 지금 뜻이 있는 버튼인지 골라야 하고, 차단된 행만
  // 골랐는데 '차단'이 활성인 화면은 무엇을 하겠다는 것인지 말하지 못한다.
  // 섞어 고르면 둘 다 서고 각자 자기 몫에만 걸린다 — 그래서 건수를 함께 적는다.
  const openCount = count - blockedCount
  const mixed = blockedCount > 0 && openCount > 0

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-radius-md border border-brand-200 bg-brand-50 px-3 py-2">
      <span className="text-body font-semibold text-gray-900">{count}건 선택</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {/*
          `로그인 열기`가 아니라 **이 사업의 접근을 허용**하는 일이다(이름을 그렇게 고쳤다).
          계정은 이미 있고 그 계정의 로그인은 이 버튼이 여는 것이 아니다 — 여기서 열리는 것은
          이 {entityNoun} 하나뿐이며, 같은 계정의 다른 사업은 이 버튼과 무관하다.
          동작은 그대로다: 접근을 허용하고 접속 안내를 보낸다.
        */}
        <Button variant="secondary" onClick={onOpen} disabled={busy}>
          {entityNoun} 접근 허용
        </Button>
        {blockedCount > 0 && (
          <Button variant="outline" onClick={onUnblock} disabled={busy}>
            차단 해제{mixed ? ` (${blockedCount})` : ''}
          </Button>
        )}
        {openCount > 0 && (
          <Button variant="outline-danger" onClick={onBlock} disabled={busy}>
            이 {entityNoun} 차단{mixed ? ` (${openCount})` : ''}
          </Button>
        )}
        {/*
          차단 옆에 서지만 **같은 축이 아니다** — 차단은 문을 닫아 두는 일이라 되돌릴 수 있고,
          빼기는 그 줄을 없애 "담은 적이 없다"로 만든다. 그래서 고른 것이 차단됐든 열려
          있든 언제나 서고(차단/해제처럼 상태에 따라 갈리지 않는다), 확인창도 따로 쓴다.
          자리를 맨 뒤로 둔 것은 되돌릴 수 없는 것이 손이 먼저 가는 자리에 있으면 안 되기
          때문이다.
        */}
        <Button variant="outline-danger" onClick={onRemove} disabled={busy}>
          명부에서 빼기
        </Button>
        <Button variant="ghost" onClick={onClear} disabled={busy}>
          선택 해제
        </Button>
      </div>
    </div>
  )
}
