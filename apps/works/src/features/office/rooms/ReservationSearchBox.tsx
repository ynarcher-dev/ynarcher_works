import { Input, Spinner, cn } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { Search } from 'lucide-react'
import { useState } from 'react'
import type { Branch } from '@/features/office/branches/branchesApi'
import { useReservationSearch, type ReservationHit } from '@/features/office/rooms/reservationsApi'
import { useDebounced } from '@/features/office/minutes/networkPeopleSearch'

const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** 결과 줄의 날짜 표기(M월 D일 (요일)). */
function hitDateLabel(date: string): string {
  const d = dayjs(date)
  return `${d.format('M월 D일')} (${KO_WEEKDAYS[d.day()]})`
}

interface Props {
  /** 지사명 표기용 — 이미 화면이 들고 있는 목록을 그대로 쓴다(추가 조회 없음). */
  branches: Branch[]
  /** 결과 선택 시 그 지사·날짜로 화면을 이동시킨다. */
  onPick: (hit: ReservationHit) => void
}

/**
 * 예약자 검색 박스(오늘 이후 예정 예약만). 이름을 넣으면 날짜·회의실·시간을 목록으로 보여주고,
 * 고르면 그 지사·날짜의 회의실 화면으로 이동한다. 팝오버 규격·닫힘 처리는 GlobalSearchBox와 맞춘다.
 */
export function ReservationSearchBox({ branches, onPick }: Props) {
  const [keyword, setKeyword] = useState('')
  const [open, setOpen] = useState(false)
  const debounced = useDebounced(keyword)

  const { data, isFetching } = useReservationSearch(debounced)
  const hits = data ?? []
  const showPanel = open && debounced.trim().length > 0

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? ''

  const pick = (hit: ReservationHit) => {
    setOpen(false)
    setKeyword('')
    onPick(hit)
  }

  return (
    <div
      // 패널 안 항목으로 포커스가 옮겨갈 때는 닫지 않는다(relatedTarget이 컨테이너 내부).
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false)
      }}
      // 폭·높이는 다른 페이지의 헤더 검색 필드와 동일 규격(max-w-xs = w-80, 페이지 밀도 Input).
      className="relative w-80"
    >
      <Input
        value={keyword}
        onChange={(e) => {
          setKeyword(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="예약자 검색"
        aria-label="예약자 검색"
        icon={<Search aria-hidden className="size-4" />}
      />
      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-dropdown mt-1.5 max-h-80 overflow-y-auto rounded-radius-md border border-gray-300 bg-white p-1 shadow-popover">
          {isFetching && hits.length === 0 && (
            <p className="flex items-center gap-2 px-3 py-2 text-body text-gray-500">
              <Spinner density="table" /> 검색 중
            </p>
          )}
          {!isFetching && hits.length === 0 && (
            <p className="px-3 py-2 text-body text-gray-500">예정된 예약이 없습니다.</p>
          )}
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => pick(h)}
              className={cn(
                'block w-full rounded-radius-md px-3 py-1.5 text-left',
                'transition-colors duration-fast hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
              )}
            >
              <span className="flex items-baseline gap-2">
                <span className="shrink-0 text-body text-gray-900">{hitDateLabel(h.reservedDate)}</span>
                <span className="shrink-0 text-body text-gray-600">
                  {h.startTime} - {h.endTime}
                </span>
              </span>
              <span className="block truncate text-caption text-gray-500">
                {[branchName(h.branchId), h.roomName, h.reserverName].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
