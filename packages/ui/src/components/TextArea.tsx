import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { formBaseClass, formInvalidClass, textAreaScale } from '../densityScale'

export interface TextAreaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
  /**
   * 내용이 길어지는 만큼 칸이 함께 자란다(스크롤 대신).
   *
   * 긴 글을 **쓰는** 칸에 켠다 — 소개·회고처럼 다 쓰고 나서 전체를 다시 읽는 글이 그렇다.
   * 고정 높이 안에서 스크롤이 생기면 방금 쓴 문단만 보이고 앞 문단은 창 밖으로 나가, 글을 고치려
   * 할 때마다 칸 안에서 자리를 다시 찾아야 한다.
   *
   * 반대로 **여러 칸이 나란히 선 폼**(사유·비고가 다른 입력들 사이에 끼어 있는 자리)에는 켜지
   * 말 것 — 한 칸이 자라면 아래 칸들이 통째로 밀려 방금 보던 자리가 움직인다.
   *
   * 켜면 세로 리사이즈 손잡이가 사라진다. 높이를 값이 정하는데 손으로도 정할 수 있으면, 손으로
   * 줄여 둔 높이가 다음 글자에 다시 늘어나 어느 쪽이 결정권자인지 화면이 답하지 못한다.
   */
  autoGrow?: boolean
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable이 내려준 맥락을 따른다. */
  density?: Density
}

/**
 * 여러 줄 입력(4상태). 높이는 `rows`(또는 `autoGrow`)가 정하므로 밀도는 **글자·여백**에만 반영한다.
 * 세로 크기를 고정하지 않는 유일한 폼 컨트롤이다.
 * react-hook-form register가 동작하도록 ref를 forward한다.
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { invalid, density, autoGrow = false, className, onInput, ...props },
  ref,
) {
  const d = useDensity(density)
  // 높이를 재려면 요소가 필요한데 ref는 호출부 것이기도 하다 — 둘 다에 꽂는다.
  const innerRef = useRef<HTMLTextAreaElement | null>(null)
  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      innerRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) ref.current = el
    },
    [ref],
  )

  const grow = useCallback(() => {
    const el = innerRef.current
    if (!el || !autoGrow) return
    // 먼저 풀어야 줄어들 때도 따라온다(줄인 뒤의 scrollHeight는 이전 높이에 갇힌다).
    el.style.height = 'auto'
    // border-box라 scrollHeight(콘텐츠+패딩)에 테두리를 더해야 마지막 줄이 잘리지 않는다.
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [autoGrow])

  // 렌더마다 다시 잰다 — 값이 폼 리셋·초기 로딩처럼 밖에서 바뀌면 입력 이벤트가 오지 않는다.
  useLayoutEffect(grow)

  return (
    <textarea
      ref={setRef}
      aria-invalid={invalid}
      onInput={(e) => {
        grow()
        onInput?.(e)
      }}
      className={cn(
        formBaseClass,
        // 스펙 요구: 최소 높이 확보 + 세로 리사이즈 허용(가로는 레이아웃이 깨지므로 막는다).
        'min-h-[7.5rem]',
        autoGrow ? 'resize-none overflow-hidden' : 'resize-y',
        textAreaScale[d],
        invalid && formInvalidClass,
        className,
      )}
      {...props}
    />
  )
})
