import type { ComponentType, ElementType, ReactNode } from 'react'
import { EmptyValue } from './EmptyValue'
import { cn } from '../utils/cn'

export interface RefLinkItem {
  /** 중복 방지·React key. */
  key: string
  /** 이름 — 링크가 걸리는 부분. */
  label: string
  /** 이름 앞 종류 표기(`AC 사업`·`전문가` 등). 이름만으로 어느 원장인지 모를 때만 준다. */
  kind?: string | null
  /** 이름 뒤 부가 표기(사업코드·소속). 동명이인을 가르는 자리다. */
  note?: string | null
  /** 이동 경로. `null`이면 링크 없이 텍스트로만 선다(접근 권한 없음·삭제됨). */
  to?: string | null
  /** 링크가 없는 이유(마우스 오버 설명). */
  title?: string
}

export interface RefLinkListProps {
  items: RefLinkItem[]
  /**
   * 링크로 렌더할 엘리먼트/컴포넌트. 앱에서 `as={Link}`로 라우터를 주입한다
   * (UI 패키지는 라우터에 의존하지 않는다 — `TextAction`과 같은 규약).
   * 생략하면 모든 항목이 링크 없는 텍스트로 선다.
   */
  as?: ElementType
  /** 항목이 하나도 없을 때 적을 값. 미지정이면 빈 값 표기(`-`). */
  empty?: ReactNode
  className?: string
}

/**
 * 다른 레코드를 가리키는 값(상호참조) 한 줄 — **배지가 아니라 쉼표로 이은 텍스트 링크**다.
 *
 * 배지를 쓰지 않는 근거는 `TagCell`이 목록에서 세운 것과 같은 자리에서 갈린다.
 *
 * 1. **색은 상태에만 쓴다.** 참석자 이름이 색 상자가 되면 한 카드에 색 덩어리가 여럿 서고,
 *    정작 상태(공개범위 배지)가 그 사이에 묻힌다.
 * 2. **배지는 값이라고 말하고 링크는 길이라고 말한다.** 누를 수 있는 배지는 둘 중 어느 것도
 *    말하지 못한다 — 눌러도 되는지 모르는 채로 커서를 올려 봐야 안다.
 * 3. **열 수 없는 대상이 죽은 배지로 남는다.** 권한이 없어 못 여는 대상까지 같은 상자를 두르면
 *    "여기 뭔가 있는데 안 열린다"가 값처럼 보인다. 텍스트는 회색으로 물러나면 그만이다.
 *
 * 크기는 이 줄이 놓인 자리(대개 `InfoField`의 값)를 그대로 물려받고 색만 바꾼다 —
 * "한 줄 안에서 크기를 갈라 위계를 만들지 않는다"(densityScale.ts).
 */
export function RefLinkList({ items, as, empty, className }: RefLinkListProps) {
  if (items.length === 0) return <>{empty ?? <EmptyValue />}</>
  const Comp = (as ?? null) as unknown as ComponentType<Record<string, unknown>> | null

  return (
    <span className={cn('inline', className)}>
      {items.map((item, i) => {
        const body = (
          <>
            {item.kind && <span className="text-gray-500">{item.kind} </span>}
            {item.label}
            {item.note && <span className="text-gray-500"> {item.note}</span>}
          </>
        )
        return (
          <span key={item.key}>
            {/* 쉼표는 링크 밖에 둔다 — 구분자까지 밑줄이 그어지면 이름의 일부로 읽힌다. */}
            {i > 0 && <span className="text-gray-500">, </span>}
            {Comp && item.to ? (
              <Comp
                to={item.to}
                title={item.title}
                className="text-brand transition-colors duration-fast hover:text-brand-600 hover:underline"
              >
                {body}
              </Comp>
            ) : (
              <span title={item.title} className="text-gray-500">
                {body}
              </span>
            )}
          </span>
        )
      })}
    </span>
  )
}
