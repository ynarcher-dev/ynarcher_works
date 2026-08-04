import { cn } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef } from 'react'

const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** 오늘 기준 상대 라벨(어제/오늘/내일) 아니면 'M월 D일 (요일)'. */
function dayLabel(date: dayjs.Dayjs): string {
  const diff = date.startOf('day').diff(dayjs().startOf('day'), 'day')
  if (diff === 0) return '오늘'
  if (diff === 1) return '내일'
  if (diff === -1) return '어제'
  return `${date.format('M월 D일')} (${KO_WEEKDAYS[date.day()]})`
}

export interface DateNavProps {
  date: dayjs.Dayjs
  onChange: (d: dayjs.Dayjs) => void
  /** 이동 단위. 'month'면 달을 넘기고 라벨도 'YYYY년 M월'이 된다. 기본 'day'. */
  unit?: 'day' | 'month'
  /**
   * 가로 정렬(기본 center). 날짜 바가 화면의 축일 때는 가운데가 맞지만, 탭·툴바처럼 왼쪽에서
   * 시작하는 줄들 사이에 끼면 혼자 가운데 뜬 것처럼 보인다 — 그때 'left'로 줄을 맞춘다.
   */
  align?: 'center' | 'left'
}

/**
 * 날짜 이동 바(‹ 라벨 › + 달력) — 회의실 예약과 근태 관리가 공유한다.
 *
 * 날짜를 축으로 삼는 화면은 같은 자리에서 같은 모양으로 움직여야 한다. 달력은 브라우저 기본
 * date 피커를 띄운다(별도 팝오버 없이 입력 규격을 앱 전체와 맞춘다).
 */
export function DateNav({ date, onChange, unit = 'day', align = 'center' }: DateNavProps) {
  const pickerRef = useRef<HTMLInputElement>(null)
  const isMonth = unit === 'month'
  const label = isMonth ? date.format('YYYY년 M월') : dayLabel(date)

  // 달력 아이콘은 꺽쇠와 달리 글리프가 상자를 꽉 채워서, 같은 여백이면 더 밖으로 나와 보인다
  // → 오른쪽만 4px 더 준다.
  return (
    <div
      className={cn(
        'flex w-fit items-center gap-1 rounded-radius-full border border-gray-200 bg-white py-1 pl-1.5 pr-2.5',
        align === 'left' ? 'mr-auto' : 'mx-auto',
      )}
    >
      <button
        type="button"
        aria-label={isMonth ? '이전 달' : '이전 날'}
        onClick={() => onChange(date.subtract(1, unit))}
        className="rounded-radius-full p-1.5 text-gray-500 hover:bg-gray-100"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-24 text-center text-body font-medium text-gray-800">{label}</span>
      <button
        type="button"
        aria-label={isMonth ? '다음 달' : '다음 날'}
        onClick={() => onChange(date.add(1, unit))}
        className="rounded-radius-full p-1.5 text-gray-500 hover:bg-gray-100"
      >
        <ChevronRight className="size-4" />
      </button>

      <span className="mx-0.5 h-4 w-px bg-gray-200" />

      <div className="relative">
        <button
          type="button"
          aria-label="날짜 선택"
          onClick={() => {
            const el = pickerRef.current
            if (!el) return
            // showPicker 미지원 브라우저에서는 포커스만 주고 키보드 입력으로 대체한다.
            if (typeof el.showPicker === 'function') el.showPicker()
            else el.focus()
          }}
          className="rounded-radius-full p-1.5 text-gray-500 hover:bg-gray-100"
        >
          <CalendarDays className="size-4" />
        </button>
        <input
          ref={pickerRef}
          type={isMonth ? 'month' : 'date'}
          tabIndex={-1}
          aria-hidden
          value={date.format(isMonth ? 'YYYY-MM' : 'YYYY-MM-DD')}
          onChange={(e) => {
            const next = dayjs(e.target.value)
            if (next.isValid()) onChange(next)
          }}
          className="pointer-events-none absolute bottom-0 left-1/2 size-0 border-0 p-0 opacity-0"
        />
      </div>
    </div>
  )
}
