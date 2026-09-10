import { Switch, cn, formText } from '@ynarcher/ui'
import { useId } from 'react'
import type { ListScope } from '@/lib/listScope'

interface ListScopeToggleBase {
  scope: ListScope
  onChange: (scope: ListScope) => void
}

/**
 * 이름은 둘 중 하나로만 정한다 — 원장 명사를 주면 규격이 조립하고(`내 {명사}만`), 그 규격이
 * 어색한 자리는 이름 전체를 준다. 둘 다 받으면 어느 쪽이 화면에 서는지 부르는 쪽에서 알 수
 * 없으므로 타입이 하나만 허용한다.
 */
export type ListScopeToggleProps = ListScopeToggleBase &
  (
    | {
        /**
         * 원장 단위 명사(네트워크·스타트업·프로젝트). 스위치 이름은 `내 {명사}만`으로
         * 선다 — 켜면 무엇이 남는지를 이름이 그대로 말해야 하고, 그 명사가 목록이 담는 것과
         * 같아야 무엇을 좁히는 스위치인지 되묻지 않는다.
         */
        noun: string
        label?: never
      }
    | {
        noun?: never
        /**
         * 이름 전체를 직접 준다. 조립 규격이 부르는 이름과 어긋날 때만 쓴다 — FUND가 그렇다
         * (목록은 '운용펀드'인데 스위치는 '내 펀드'로 부른다, 2026-09-10 사용자 지정).
         */
        label: string
      }
  )

/**
 * 목록 범위 스위치(내 ~만) — 원장 목록 5종 공용.
 *
 * 2026-09-05에 워크스페이스마다 사이드바 두 줄로 갈려 있던 범위를 목록 안의 축 하나로 모았다.
 * 범위를 메뉴로 두면 그것이 '어디에 있는가'가 되어 구분·지역·상태 같은 다른 축과 함께 걸 수
 * 없고, 메뉴를 옮길 때마다 걸어 둔 검색어와 필터가 사라진다.
 *
 * 2026-09-07에 기본 범위가 '전체'로 바뀌면서 세그먼트(`내 ~` / `전체 ~`)를 스위치로 바꿨다.
 * 두 칸이 대등하게 서면 어느 쪽이 이 목록의 기본인지 형태가 말하지 않고, '전체' 칸이 늘 켜진
 * 채로 자리만 차지한다. 스위치는 꺼진 상태가 곧 기본이고 켜는 것이 좁히는 일이라, 같은 줄의
 * 다른 필터 축과 성격이 같아진다(걸면 좁아진다).
 */
export function ListScopeToggle({ scope, onChange, noun, label }: ListScopeToggleProps) {
  const id = useId()
  return (
    <div className="inline-flex items-center gap-2">
      <label
        htmlFor={id}
        className={cn(formText.label, 'cursor-pointer select-none whitespace-nowrap')}
      >
        {label ?? `내 ${noun}만`}
      </label>
      <Switch
        id={id}
        checked={scope === 'mine'}
        onChange={(on) => onChange(on ? 'mine' : 'all')}
      />
    </div>
  )
}
