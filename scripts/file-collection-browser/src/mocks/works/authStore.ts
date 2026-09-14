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

/**
 * 읽기 권한. `GUEST 계정 생성`의 `데이터베이스 연결` 칸은 이 값이 거짓이면 입력칸 대신 한 줄
 * 문구로 바뀌므로, 7번째 트랙의 두 모습을 모두 재려면 주소로 갈릴 수 있어야 한다
 * (`?canRead=0`). 기본은 참이다 — 화면에서 감추는 것은 인가가 아니다(서버가 판정한다).
 */
export function hasWorkspaceRead(_user: unknown, _workspaceKey: string): boolean {
  return new URLSearchParams(globalThis.location?.search ?? '').get('canRead') !== '0'
}
