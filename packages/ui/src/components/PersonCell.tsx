import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EmptyValue } from './EmptyValue'

export interface PersonCellProps {
  /** 사람 이름 목록. 순서는 화면이 정한다(대표·리드를 앞에 세우는 등). */
  names: readonly (string | null | undefined)[]
  /** 아무도 없을 때 적을 값. 미지정이면 빈 값 표기(`-`). */
  empty?: ReactNode
  /**
   * 적을 이름의 **개수 상한**. 주면 폭 재기를 하지 않고 언제나 이만큼까지 적는다.
   *
   * 표의 열은 폭이 곧 상한이라 이 값을 주지 않는다(폭이 남는데 셋에서 멈출 이유가 없다).
   * 반대로 **좁은 카드**는 폭에 맡기면 거의 언제나 한 명 + `+N`이 되어, 담당자가 여럿인 카드와
   * 한 명인 카드가 같은 모양으로 읽힌다 — 자리가 답을 정해 버리는 자리에서는 개수로 정한다.
   */
  max?: number
  /**
   * 이름 줄을 여러 줄로 흘릴지. 기본은 한 줄 말줄임이다.
   *
   * 높이가 정해진 자리(표 셀·간트 행)에서 줄이 늘면 행 격자가 어긋나므로 기본이 한 줄이고,
   * 높이가 자유로운 카드에서만 켠다 — 거기서는 잘라 감추는 것보다 한 줄 더 쓰는 편이 낫다.
   */
  wrap?: boolean
}

/** 이름과 이름 사이 구분자. 자를 때의 폭 계산도 이 문자열을 잰다. */
const SEPARATOR = ', '

/** 이름 줄과 `+N` 사이 간격(`gap-1` = 4px). 폭 계산에서 함께 빼야 마지막 이름이 밀리지 않는다. */
const COUNTER_GAP = 4

/**
 * 사람 이름이 여럿인 셀 — **열 폭이 허락하는 만큼 이름을 적고, 넘치는 수만 `+N`으로 알린다.**
 *
 * 이전에는 개수와 무관하게 첫 사람만 적고 나머지를 `외 N`으로 접었다(구 `memberSummary`).
 * 이름 열은 대개 표에서 가장 좁은 축에 속하므로 안전한 규격이었지만, 폭이 남는 표에서도 언제나
 * 한 명만 보였다 — 담당자가 셋인 사업과 하나인 사업이 목록에서 똑같이 `강피엠 외 …`으로 읽혔고,
 * 누구에게 물어야 하는지 알려면 매번 상세로 들어가야 했다(2026-09-02 사용자 지정으로 전환).
 *
 * 그래서 접는 기준을 **개수가 아니라 자리**로 바꾼다. 셋이 다 들어가면 셋을 적고, 둘까지만
 * 들어가면 둘을 적고 `+1`을 붙인다. 상한이 폭이므로 열이 넓어지면 저절로 더 보인다.
 *
 * 다만 **좁은 카드에서는 자리가 답을 정해 버린다**(2026-09-06 사용자 지정) — 칸반 카드·간트
 * 1열처럼 폭이 200px 안팎인 자리에서는 폭에 맡기면 거의 언제나 첫 사람 + `+N`이 되어 담당자가
 * 셋인 모듈과 하나인 모듈이 같은 모양으로 읽힌다. 그 자리들은 `max`로 개수 상한을 준다.
 *
 * 폭은 잴 수밖에 없다 — 글자 폭은 글꼴·자간·확대 배율에 따라 달라서 "한글 이름 = 몇 px"로
 * 어림하면 어느 환경에서는 한 명이 덜 보이고 어느 환경에서는 잘린다. 숨은 자(`ruler`)에 이름을
 * 한 번 그려 실제 폭을 읽고, 열 폭이 바뀌면(`ResizeObserver`) 다시 센다.
 *
 * 전체 값은 `title`에 남긴다 — `+N`에 마우스를 올려 누가 더 있는지 확인할 수 있어야 한다.
 */
export function PersonCell({ names, empty, max, wrap }: PersonCellProps) {
  // 이름 배열은 렌더마다 새로 만들어져 오므로, 내용이 같으면 같은 참조가 되도록 문자열로 접는다.
  // 이름 안에 무엇이 들어 있어도 안전하도록 이음쇠를 손으로 고르지 않고 JSON에 맡긴다.
  const key = JSON.stringify(
    names.filter((v): v is string => Boolean(v && v.trim())).map((v) => v.trim()),
  )
  const list = useMemo(() => JSON.parse(key) as string[], [key])
  const boxRef = useRef<HTMLSpanElement>(null)
  const rulerRef = useRef<HTMLSpanElement>(null)
  // 초기값은 전원 — 잴 수 없는 환경(SSR·테스트)에서도 이름이 사라지지 않는다.
  const [shown, setShown] = useState(list.length)

  useLayoutEffect(() => {
    setShown(list.length)
    const box = boxRef.current
    const ruler = rulerRef.current
    // 개수 상한이 있으면 폭은 보지 않는다 — 둘을 함께 적용하면 상한을 준 자리에서 다시 폭에
    // 밀려 한 명만 남고, 개수로 정한 이유가 그대로 사라진다.
    if (max != null || !box || !ruler || list.length <= 1) return
    const measure = () => {
      const parts = Array.from(ruler.children) as HTMLElement[]
      const widthOf = (el: HTMLElement | undefined) => el?.getBoundingClientRect().width ?? 0
      const nameW = list.map((_, i) => widthOf(parts[i]))
      const sepW = widthOf(parts[list.length])
      // `+N`의 N은 최대 (전체 − 1)이라, 가장 넓어질 수 있는 값으로 자리를 잡아 둔다.
      const counterW = widthOf(parts[list.length + 1]) + COUNTER_GAP
      const avail = box.clientWidth
      if (avail === 0) return
      const total = nameW.reduce((sum, w) => sum + w, 0) + sepW * (list.length - 1)
      if (total <= avail) {
        setShown(list.length)
        return
      }
      let used = nameW[0] ?? 0
      let fit = 1
      for (let i = 1; i < list.length; i += 1) {
        const next = used + sepW + (nameW[i] ?? 0)
        // 한 명을 더 적으려면 그 뒤에 설 `+N` 자리까지 남아야 한다.
        if (next + counterW > avail) break
        used = next
        fit = i + 1
      }
      setShown(fit)
    }
    measure()
    // 열 폭은 창 크기·형제 열의 값 길이에 따라 바뀐다. jsdom 등 관찰자가 없는 환경은 한 번만 잰다.
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [list, max])

  if (list.length === 0) return <>{empty ?? <EmptyValue />}</>

  const visible = max != null ? Math.min(list.length, max) : shown
  const hidden = list.length - visible
  return (
    <span
      ref={boxRef}
      className={`flex min-w-0 items-baseline gap-1 ${wrap ? 'flex-wrap' : ''}`}
      title={list.join(SEPARATOR)}
    >
      {/* 한 명도 다 못 들어가는 폭에서는 이 줄이 말줄임된다 — `+N`은 그때도 남아야 한다. */}
      <span className={wrap ? 'min-w-0 break-words' : 'truncate'}>
        {list.slice(0, visible).join(SEPARATOR)}
      </span>
      {hidden > 0 && <span className="shrink-0 text-gray-500">+{hidden}</span>}
      {/*
        숨은 자 — 화면에 그려지지 않되 같은 글꼴로 실제 폭을 재기 위한 사본이다.
        `absolute`라 레이아웃에 끼어들지 않고, `whitespace-pre`라 구분자의 공백이 접히지 않는다.
      */}
      <span
        ref={rulerRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre"
      >
        {list.map((name, index) => (
          <span key={`${name}-${index}`}>{name}</span>
        ))}
        <span>{SEPARATOR}</span>
        <span>+{list.length - 1}</span>
      </span>
    </span>
  )
}
