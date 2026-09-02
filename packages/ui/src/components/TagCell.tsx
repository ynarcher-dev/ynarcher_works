import { EmptyValue } from './EmptyValue'

export interface TagCellProps {
  /** 태그 이름 목록. 빈 배열이면 빈 값 표기로 떨어진다. */
  items: (string | null | undefined)[]
  /** 나열 상한(기본 3). 원장이 정한 입력 상한과 같은 수를 준다. */
  max?: number
}

/**
 * 값이 여러 개인 분류 태그(분야·업종) 셀 — **목록에서는 배지가 아니라 한 줄 텍스트**로 적는다.
 * `type: 'tags'` 열이 쓴다.
 *
 * 배지를 쓰지 않는 이유는 셋이다.
 *
 * 1. **색은 상태에만 쓴다**(§3.4). 분류까지 색 배지가 되면 한 행에 색 덩어리가 여럿 서고, 표를
 *    훑을 때 지금 확인해야 할 행이 무엇인지 색이 알려주지 못한다.
 * 2. **개수가 행마다 다르다.** 배지는 개수만큼 폭이 널뛰어 행마다 색 덩어리의 길이가 달라지고,
 *    세로로 훑는 눈이 그 요철에 걸린다.
 * 3. **잘림이 조각을 남긴다.** 폭이 모자랄 때 배지 줄은 배지 한 개의 중간에서 잘려 반쪽이
 *    남는데, 그것은 압축이 아니라 화면이 깨진 것으로 읽힌다. 글자는 말줄임이 자연스럽다.
 *
 * 상세 화면에서는 배지가 맞다 — 거기서는 태그가 훑어야 할 배경이 아니라 읽어야 할 값이고,
 * 한 화면에 한 레코드만 있어 개수가 널뛰는 문제도 없다.
 *
 * 전체 값은 `title`로 남긴다 — 말줄임된 자리는 마우스를 올려 확인할 수 있어야 한다.
 */
export function TagCell({ items, max = 3 }: TagCellProps) {
  const names = items.filter((v): v is string => Boolean(v && v.trim()))
  if (names.length === 0) return <EmptyValue />
  const shown = names.slice(0, max)
  // 상한을 넘긴 개수는 숫자로만 알린다 — 이름을 더 늘어놓아 봐야 어차피 말줄임된다.
  const rest = names.length - shown.length
  const text = rest > 0 ? `${shown.join(', ')} 외 ${rest}` : shown.join(', ')
  return (
    <span className="block truncate" title={names.join(', ')}>
      {text}
    </span>
  )
}
