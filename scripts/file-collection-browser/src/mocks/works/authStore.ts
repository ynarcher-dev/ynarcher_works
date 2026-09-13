/**
 * 인증 스토어의 **검증용 대역**. 실물은 Supabase 세션을 물고 있어 브라우저 검증에서 쓸 수 없다.
 *
 * 여기서 답하는 것은 "이 화면이 조작부를 세우는가" 하나다 — **인가가 아니다.** 실제 판정은
 * 서버(RLS/RPC)가 하고, 화면에서 감추는 것은 누를 수 없는 버튼을 보이지 않기 위한 것이다.
 */
import { scenario } from '../scenario'

interface MockUser {
  id: string
  name: string
  role: string
}

const user: MockUser = { id: 'usr-works-1', name: '박담당', role: 'MEMBER' }

export function useAuthStore<T>(selector: (state: { user: MockUser }) => T): T {
  return selector({ user })
}

export function hasWorkspaceWrite(_user: unknown, _workspaceKey: string): boolean {
  return scenario.canWrite
}
