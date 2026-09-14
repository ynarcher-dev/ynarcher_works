import { Button, cn, useDensity, type ButtonProps } from '@ynarcher/ui'

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
 *
 * ## 카드 안에서는 카드 밀도를 따른다 (2026-09-14 사용자 지정)
 *
 * 48px 하한은 **페이지에 바로 놓인 버튼**에만 얹는다. 파일받기 패널처럼 GUEST에도 카드섹션이
 * 선 뒤로는, 카드 안 버튼이 works의 같은 자리(32px)보다 눈에 띄게 커서 카드 하나가 버튼에
 * 끌려다녔다 — 크기를 가르는 축은 앱이 아니라 **놓이는 자리**라는 것이 밀도 규칙의 요지이므로,
 * 카드 안에서는 그 규칙을 그대로 따르고 하한을 얹지 않는다. 터치 하한이 실제로 필요한 자리
 * (페이지 본문·사이드바·상단바)는 여전히 `page` 맥락이라 48px 그대로다.
 */
export function GuestButton({ className, density, ...props }: ButtonProps) {
  const resolved = useDensity(density)
  return (
    <Button
      density={resolved}
      className={cn(resolved === 'page' && 'min-h-12', className)}
      {...props}
    />
  )
}
