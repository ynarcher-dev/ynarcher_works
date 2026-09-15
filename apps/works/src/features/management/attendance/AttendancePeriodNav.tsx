import { Button, IconButton, cardText, cn } from '@ynarcher/ui'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface AttendancePeriodNavProps {
  /** 지금 보고 있는 기간(`2026년 09월 07일 ~ 13일`·`2026년 9월`). */
  label: string
  /** 앞뒤 버튼의 스크린리더 라벨 — 옮기는 단위가 주인지 달인지는 부르는 쪽이 안다. */
  prevLabel: string
  nextLabel: string
  /** 현재 기간으로 되돌아가는 버튼의 글자(`이번 주`·`이번 달`). */
  resetLabel: string
  /** 이미 현재 기간인가. 그러면 되돌아갈 곳이 없으므로 버튼을 끈다. */
  atCurrent: boolean
  onPrev: () => void
  onNext: () => void
  onReset: () => void
}

/**
 * 근태 화면의 기간 이동 줄 — 주간·월간이 한 벌을 나눠 쓴다.
 *
 * **카드 헤더가 아니라 본문 한가운데**에 선다. 이 줄이 가리키는 것은 카드 전체가 아니라 바로
 * 아래 놓인 값들이 어느 기간을 말하는지이고, 우측 액션 자리로 올리면 제목과 한 줄에 서서
 * 카드 이름의 부속처럼 읽힌다. 가운데에 두면 아래 내용의 머리말이 되어, 눈이 기간을 본 다음
 * 그대로 내려가 그 기간의 값을 읽는다.
 *
 * 두 화면이 같은 자리에서 같은 모양으로 움직여야 하므로 규격을 한곳에 둔다 — 한쪽만 고치면
 * 같은 페이지 안에서 기간을 옮기는 방법이 두 가지가 된다.
 */
export function AttendancePeriodNav({
  label,
  prevLabel,
  nextLabel,
  resetLabel,
  atCurrent,
  onPrev,
  onNext,
  onReset,
}: AttendancePeriodNavProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      <IconButton icon={<ChevronLeft />} label={prevLabel} variant="ghost" onClick={onPrev} />
      <span className={cn(cardText.title, 'tabular-nums')}>{label}</span>
      <IconButton icon={<ChevronRight />} label={nextLabel} variant="ghost" onClick={onNext} />
      {/* 되돌아가는 버튼은 날짜 묶음의 부속이 아니라 다른 종류의 조작이라 한 칸 띄워 세운다. */}
      <Button type="button" variant="secondary" className="ml-2" disabled={atCurrent} onClick={onReset}>
        {resetLabel}
      </Button>
    </div>
  )
}
