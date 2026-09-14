/**
 * GUEST 앱 주소.
 *
 * WORKS는 GUEST 앱의 오리진을 따로 갖고 있지 않다. 바깥에 뿌리는 두 주소
 * (`VITE_APPLY_BASE_URL`·`VITE_PUBLIC_MODULE_BASE_URL`)가 **모두 같은 GUEST 배포**를
 * 가리키므로(`apps/works/.env.example`), 그중 하나의 오리진이 곧 GUEST 앱이다. 공개용
 * 도메인 별칭이 여럿이어도 열리는 앱은 하나다.
 *
 * 둘 다 비어 있으면 주소를 지어내지 않고 `null`을 돌려 부르는 쪽이 진입점을 감추게 한다 —
 * WORKS 자신의 오리진으로 떨어지면 없는 화면을 여는 문이 생긴다.
 */
function resolveGuestOrigin(): string | null {
  const candidates = [
    import.meta.env.VITE_APPLY_BASE_URL as string | undefined,
    import.meta.env.VITE_PUBLIC_MODULE_BASE_URL as string | undefined,
  ]
  for (const raw of candidates) {
    const value = raw?.trim()
    if (!value) continue
    try {
      return new URL(value).origin
    } catch {
      continue
    }
  }
  return null
}

export const GUEST_APP_ORIGIN = resolveGuestOrigin()

/** GUEST 앱 착지점. 세션이 있으면 사업개요로, 없으면 로그인으로 앱이 스스로 보낸다. */
export const GUEST_APP_URL = GUEST_APP_ORIGIN ? `${GUEST_APP_ORIGIN}/` : null

/** GUEST 앱 로그인 화면. 세션 여부와 무관하게 로그인 폼을 열어야 할 때만 쓴다. */
export const GUEST_LOGIN_URL = GUEST_APP_ORIGIN ? `${GUEST_APP_ORIGIN}/login` : null

/**
 * GUEST 앱을 새 창으로 연다.
 *
 * 새 창인 이유는 세션이 갈리기 때문이다 — 같은 창에서 옮겨 가면 보던 WORKS 화면을 잃고,
 * 돌아올 때 목록의 탭·페이지를 다시 짚어야 한다. `noopener`로 원래 창의 제어권(`window.opener`)은
 * 넘기지 않는다.
 */
export function openGuestApp(): void {
  if (!GUEST_APP_URL) return
  window.open(GUEST_APP_URL, '_blank', 'noopener,noreferrer')
}
