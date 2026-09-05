/**
 * 값이 하나도 없는 카드가 스스로 답하는 한 줄.
 *
 * 카드 단위의 빈 상태는 밴드 안에 카드가 둘일 때 맞는 처리였다. 역량 밴드가 카드 넷이 된
 * 뒤로는 **밴드가 통째로 비면** 같은 문장이 넷 서므로, 그 경우는 밴드가 한 줄로 답한다
 * (`StartupCapabilitySection`). 여기 남는 것은 '일부만 비어 있을 때' 그 카드가 답하는 몫이다.
 */
export function EmptyLine({ noun }: { noun: string }) {
  return <p className="text-body text-gray-600">등록된 {noun} 정보가 없습니다. "수정"에서 입력하세요.</p>
}
