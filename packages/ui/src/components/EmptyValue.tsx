import { tableText } from '../densityScale'

/**
 * 빈 값 표기 — 값이 없는 자리를 대신하는 짧은 가로줄 하나.
 *
 * 글자는 하이픈(`-`)이다. em 대시(`—`)는 한글 폰트에서 글자 한 칸을 통째로 차지해, 값이 없는
 * 칸이 값이 있는 칸보다 오히려 길고 진해 보인다 — 표를 세로로 훑을 때 비어 있는 자리가 먼저
 * 눈에 걸린다. 색도 실제 값보다 한 단계 흐리게 둔다(`tableText.empty`). 없다는 사실은 알리되
 * 읽히지는 않게 하는 것이 이 자리의 목적이다.
 *
 * 표·카드 어디서든 같은 글자와 같은 색을 쓰도록 이 컴포넌트 하나로 모은다 — 화면마다
 * `'-'`와 `text-gray-400`을 손으로 조합하면 그 조합이 곧 흔들린다.
 */
export function EmptyValue() {
  return <span className={tableText.empty}>-</span>
}
