import { IconButton, cn, useDensity, type IconButtonProps } from '@ynarcher/ui'

/**
 * GUEST 앱 아이콘 버튼 — works와 **같은** `IconButton`을 쓰되 페이지 맥락에서만 터치 영역을
 * 48px로 올린다. 라벨 버튼에서 `GuestButton`이 하는 일을 아이콘 버튼에서 하는 짝이며, 하한의
 * 근거(3_9_workspace_guest.md §2 — 모바일 오터치 방지)와 카드 안에서 하한을 얹지 않는 이유
 * (밀도는 앱이 아니라 놓이는 자리가 정한다)도 그대로 같다.
 */
export function GuestIconButton({ className, density, ...props }: IconButtonProps) {
  const resolved = useDensity(density)
  return (
    <IconButton
      density={resolved}
      className={cn(resolved === 'page' && 'min-h-12 min-w-12', className)}
      {...props}
    />
  )
}
