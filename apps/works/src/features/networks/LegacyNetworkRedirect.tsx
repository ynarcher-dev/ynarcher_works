import { Navigate, useParams } from 'react-router-dom'

/**
 * 옛 상세 경로를 통합 상세로 보낸다.
 *
 * 통합 전에는 구분마다 원장이 있어 경로도 갈려 있었다(`/networks/experts/:id`,
 * `/networks/global/:id` …). 이관이 id를 보존하므로 그 주소들이 가리키던 레코드는 그대로
 * 살아 있고, 경로만 바뀌었다. 밖에 나간 링크·알림·회의록 상호참조가 죽지 않도록 같은 id로
 * 새 경로에 연결한다.
 *
 * 등록 경로(`/networks/experts/new`)는 구분을 물려준다 — 그 주소가 말하던 '어느 구분으로
 * 만들 것인가'를 통합 폼에서는 `?category=`가 이어받는다.
 */
export function LegacyNetworkRedirect() {
  const { entity, id } = useParams<{ entity: string; id: string }>()
  if (id === 'new') {
    return <Navigate to={`/networks/record/new?category=${entity ?? ''}`} replace />
  }
  return <Navigate to={`/networks/record/${id}`} replace />
}
