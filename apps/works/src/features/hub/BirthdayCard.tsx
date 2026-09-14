import { cardText, cn } from '@ynarcher/ui'
import { useTodayBirthdays } from '@/features/hub/hooks'

/**
 * 오늘 생일인 임직원을 알리는 카드 — 전사 캘린더 패널 맨 위.
 *
 * **생일자가 없는 날에는 아무것도 세우지 않는다.** 이 카드는 처리할 일감이 아니라 알림이라,
 * 1년에 300일 넘게 서는 "오늘은 생일자가 없습니다"는 그 자체로 잡음이고 그 잡음이 매일 서면
 * 정작 생일자가 있는 날의 카드도 같은 자리에 있던 것으로 읽혀 눈에 걸리지 않는다.
 *
 * 값은 원장이 아니라 `today_birthdays()`가 답한다(생년월일은 MANAGEMENT 전용이고, 이 창구는
 * 연도·월·일 어느 것도 내보내지 않는다 — `useTodayBirthdays` 주석 참조).
 *
 * 카드가 일정 목록이 아니라 캘린더 **위**에 서는 이유는 생일이 일정이 아니라 사실이기 때문이다.
 * `DayAgenda`의 업무·휴가·기타 섹션은 `system_events` 행이라, 생일을 거기 넣으면 그 순간
 * 인사 원장의 복제본이 캘린더에 생긴다.
 */
export function BirthdayCard() {
  const { data } = useTodayBirthdays()
  const people = data ?? []
  if (people.length === 0) return null

  return (
    <ul className="mb-3 shrink-0 space-y-2" aria-label="오늘의 생일자">
      {people.map((person) => (
        <li
          key={person.user_id}
          className="rounded-radius-sm border border-info-border bg-info-subtle/60 px-3 py-2.5"
        >
          <p className={cn('flex items-start gap-1.5 font-semibold text-info', cardText.value)}>
            <span aria-hidden>🎂</span>
            <span>오늘은 {person.user_name}님의 생일이에요!</span>
          </p>
          <p className={cn('mt-0.5 pl-[1.6rem] text-gray-700', cardText.meta)}>
            함께 축하의 마음을 전해보세요 🎉
          </p>
        </li>
      ))}
    </ul>
  )
}
