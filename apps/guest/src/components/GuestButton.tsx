import { Button, cn, type ButtonProps } from '@ynarcher/ui'

/**
 * GUEST 앱 버튼 — works와 **같은** `Button`을 쓰되 터치 영역만 48px로 올린다.
 *
 * 두 가지 규칙이 동시에 걸리는 자리라 래퍼가 필요하다.
 *
 * * 색·모서리·호버·클릭·포커스 링은 전 플랫폼 공통이다(4_color_system_rules.md §5.1).
 *   손으로 `bg-brand px-4 py-2`를 조합하던 시절에는 GUEST만 포커스 링이 없어 키보드
 *   사용자에게 지금 어느 버튼에 있는지 보이지 않았고, 모서리도 토큰이 아닌 Tailwind 기본
 *   `rounded`(4px)라 같은 브랜드의 화면인데 works와 모서리가 달랐다.
 * * 높이만 GUEST 고유다. 밀도 격자(page 40 / card 32 / table 24)는 마우스를 전제한 값이고,
 *   GUEST는 모바일 우선이라 **최소 48px**을 따로 정해 두었다(3_9_workspace_guest.md §2).
 *   `min-h`로 얹으므로 라벨이 길어 두 줄이 되면 그만큼 더 늘어난다.
 *
 * 밀도는 `page`로 고정한다 — GUEST에는 카드섹션·데이터표 맥락이 없고, 40px 규격의 글자·여백
 * 위에 48px 하한을 얹는 것이 이 앱에서 버튼이 서는 유일한 방식이다.
 */
export function GuestButton({ className, ...props }: ButtonProps) {
  return <Button density="page" className={cn('min-h-12', className)} {...props} />
}
