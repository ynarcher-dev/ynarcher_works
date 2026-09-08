import { Navigate, useLocation, useParams } from 'react-router-dom'

/**
 * 옛 경로를 새 경로로 보낸다 — **쿼리와 해시를 그대로 들고 간다.**
 *
 * `<Navigate to="/project" />`로 충분해 보이지만 그러면 `?tab=`이 떨어진다. 이 앱은 하위
 * 화면이 전부 쿼리라(`/office?tab=approval&doc=…`) 쿼리를 잃은 리다이렉트는 사용자를 그
 * 워크스페이스의 첫 화면에 내려놓고, 알림·북마크가 가리키던 그 문서는 사라진다. 주소를
 * 바꾸면서 지켜야 하는 것은 경로가 아니라 **그 주소가 열던 화면**이다.
 */
export function LegacyRedirect({
  to,
}: {
  /** 새 경로. 파라미터가 필요하면 함수로 받아 `:id` 등을 물려준다. */
  to: string | ((params: Record<string, string | undefined>) => string)
}) {
  const params = useParams()
  const { search, hash } = useLocation()
  const target = typeof to === 'function' ? to(params) : to
  return <Navigate to={`${target}${search}${hash}`} replace />
}
