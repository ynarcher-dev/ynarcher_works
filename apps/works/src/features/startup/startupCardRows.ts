import type { InfoRowItem } from '@ynarcher/ui'
import type { ReactNode } from 'react'

/**
 * 라벨: 값 한 줄 목록을 만든다(값 없으면 그 줄 자체를 세우지 않는다).
 *
 * 라벨을 값 **위에** 쌓던 것을 2026-09-06에 `InfoRows`(라벨 열 + 값 열)로 옮겼다. 규격
 * 자체는 그때도 맞았다 — 라벨과 값은 크기가 같고 색만 갈린다(`cardText.label` gray-500 :
 * `cardText.value` gray-900). 문제는 그 규칙이 **한 줄 안에서** 위계를 만드는 규칙이라는 것이다.
 * 라벨과 값이 한 줄에 나란히 서면 어느 쪽이 라벨인지는 자리가 이미 말해 주고 색은 거들 뿐인데,
 * 위아래로 쌓으면 둘이 같은 왼쪽 모서리에서 같은 크기로 시작해 **색 하나가 그 일을 혼자 진다.**
 * 그러면 여섯 줄짜리 카드가 회색·검정이 번갈아 나오는 띠가 되어, 찾는 항목이 몇째 줄인지
 * 훑을 기준선이 없다. 색을 진하게 하는 것은 답이 아니다(색은 상태에만 쓴다) — 색이 혼자 지던
 * 일을 자리가 나눠 지게 하는 것이 답이고, 그 자리가 `InfoRows`의 고정폭 라벨 열이다.
 *
 * 라벨 열은 6rem이고 그 폭은 `InfoRows`가 소유한다. 그래서 접히는 라벨은 열을 넓혀서가 아니라
 * **라벨을 줄여서** 맞춘다(표 머리글과 같은 규칙) — `타겟 시장 & 고객` → `타겟 고객`,
 * `대표 / 창업자 역량` → `창업자 역량`. 라벨 열이 index로 읽히려면 한 눈에 들어오는 길이여야
 * 하고, 잘라 낸 쪽은 어차피 옆말이었다.
 */
export function rows(items: { label: string; value: ReactNode; multiline?: boolean }[]): InfoRowItem[] {
  return items
    .filter((it) => it.value !== '' && it.value != null && it.value !== false)
    .map((it) => ({
      label: it.label,
      value: it.value,
      ...(it.multiline ? { valueClassName: 'whitespace-pre-wrap leading-relaxed' } : {}),
    }))
}
