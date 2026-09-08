/**
 * 명부 한 줄이 **누구로** 들어오는가.
 *
 * 화면(사람 고르기 단계)이 정하고 데이터 계층(`useAddParticipants`)이 계정 id로 바꾼다.
 * 계정 id 하나로 뭉치지 않고 두 갈래로 두는 이유는 **두 행위가 다르기** 때문이다 — 고르는
 * 쪽은 이미 있는 사람을 가리키는 일이고, 적는 쪽은 계정을 하나 세우는 일이다. 한 모양으로
 * 뭉치면 담당자가 방금 새 계정을 만들었다는 사실이 화면 어디에도 남지 않는다.
 *
 * 타입이 화면 파일이 아니라 여기 사는 이유는 쓰는 쪽이 둘이기 때문이다(고르는 화면과 담는
 * 훅). 한쪽에 두고 다른 쪽이 같은 모양을 다시 적으면, 갈래를 하나 더할 때 한쪽만 고쳐진다.
 */
export type PersonChoice =
  | { kind: 'existing'; userId: string }
  | { kind: 'new'; name: string; email: string; phone: string }

/**
 * 이 선택으로 계정을 세울 수 있는가.
 *
 * 이메일이 로그인 ID라 이름과 함께 필수다. 연락처는 묻지 않는다 — 초기 비밀번호가 되는
 * 값이지만, 그 이메일의 계정이 이미 있으면 서버가 그 계정을 그대로 돌려주므로(멱등)
 * 비밀번호를 새로 만들 일이 없다. 정말 필요한 경우에는 서버가 사유와 함께 멈춘다.
 */
export function isChoiceReady(choice: PersonChoice | undefined): boolean {
  if (!choice) return false
  if (choice.kind === 'existing') return true
  return Boolean(choice.name.trim() && choice.email.trim())
}
