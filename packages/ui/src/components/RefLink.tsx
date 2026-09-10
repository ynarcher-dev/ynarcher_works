import type { ComponentType, ElementType, ReactNode } from 'react'
import { Badge } from './Badge'
import { EmptyValue } from './EmptyValue'
import { cn } from '../utils/cn'

export interface RefLinkItem {
  /** 중복 방지·React key. */
  key: string
  /** 이름 — 링크가 걸리는 부분. */
  label: string
  /** 이름 앞 종류 표기(`STARTUP`·`전문가`·소속 등). 이름만으로 어디서 온 값인지 모를 때만 준다. */
  kind?: string | null
  /** 이름 뒤 부가 표기(사업코드·소속). 동명이인을 가르는 자리다. */
  note?: string | null
  /**
   * 이동 경로.
   *
   * **`null`과 미지정은 다르다.** `null`은 *갈 곳이 없다*(접근 권한 없음·삭제됨)라 회색으로
   * 물러나고, 아예 주지 않으면 *길을 두지 않는다*라 값 그대로의 톤으로 선다. 둘을 같은 회색으로
   * 세우면 링크를 걸지 않기로 한 화면에서 멀쩡한 값이 전부 '못 여는 대상'처럼 보인다.
   */
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
  /**
   * 종류 표기(`kind`)를 세우는 방식. 기본은 이름 앞 회색 글자다.
   *
   * `'tag'`는 그것을 태그 하나로 세운다 — **상세 화면 전용**이다. 목록에서 분류를 배지로
   * 세우지 않는 근거(`TagCell`)는 훑는 눈에 색 덩어리가 걸린다는 것인데, 상세는 한 레코드만
   * 서는 자리라 그 요철이 생기지 않고 거기서 종류는 배경이 아니라 읽어야 할 값이다.
   *
   * 태그가 되는 것은 **이름이 아니라 그 이름이 어디서 온 것인가**이므로 "상호참조는 배지가
   * 아니라 텍스트 링크다"와 어긋나지 않는다 — 이름은 그대로 텍스트로 서고 길도 이름에만 걸린다.
   * 그래서 태그는 링크 **밖에** 세운다(안에 두면 이름에 걸린 밑줄이 분류까지 함께 긋는다).
   */
  kindAs?: 'text' | 'tag'
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
export function RefLinkList({ items, as, kindAs = 'text', empty, className }: RefLinkListProps) {
  if (items.length === 0) return <>{empty ?? <EmptyValue />}</>
  const Comp = (as ?? null) as unknown as ComponentType<Record<string, unknown>> | null

  return (
    <span className={cn('inline', className)}>
      {items.map((item, i) => {
        const asTag = kindAs === 'tag' && Boolean(item.kind)
        const body = (
          <>
            {item.kind && !asTag && <span className="text-gray-500">{item.kind} </span>}
            {item.label}
            {item.note && <span className="text-gray-500"> {item.note}</span>}
          </>
        )
        return (
          <span key={item.key}>
            {/* 쉼표는 링크 밖에 둔다 — 구분자까지 밑줄이 그어지면 이름의 일부로 읽힌다. */}
            {i > 0 && <span className="text-gray-500">, </span>}
            {asTag && (
              // 이름과 같은 줄에 서므로 글자 흐름에 맞춰 중앙으로 맞춘다 — 태그는 고정 높이라
              // 기준선에 그대로 놓으면 아래로 처져 줄 간격이 태그 있는 줄에서만 벌어진다.
              <Badge tone="neutral" className="mr-1 align-middle">
                {item.kind}
              </Badge>
            )}
            {Comp && item.to ? (
              <Comp
                to={item.to}
                title={item.title}
                className="text-brand transition-colors duration-fast hover:text-brand-600 hover:underline"
              >
                {body}
              </Comp>
            ) : (
              // 갈 곳이 없다고 명시된 항목만 물러난다. 라우터를 주지 않아 링크가 안 걸린
              // 항목은 색을 지정하지 않고 놓인 자리(대개 `InfoField`의 값)를 물려받는다.
              <span title={item.title} className={item.to === null ? 'text-gray-500' : undefined}>
                {body}
              </span>
            )}
          </span>
        )
      })}
    </span>
  )
}
