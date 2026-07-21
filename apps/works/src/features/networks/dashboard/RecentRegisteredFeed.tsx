import { Badge, type BadgeTone } from '@ynarcher/ui'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'

const DAY_MS = 86_400_000

/** 시각을 버린 자정 기준 날짜 사본. */
function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
/** 해당 날짜가 속한 주(월요일 시작)의 월요일 0시. */
function weekStart(d: Date): Date {
  const x = atMidnight(d)
  const dow = (x.getDay() + 6) % 7 // 월=0 … 일=6
  x.setDate(x.getDate() - dow)
  return x
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function fmtDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
/** 등록일 파싱(빈값/파싱 실패는 null). */
function parseDate(v: unknown): Date | null {
  if (typeof v !== 'string' || v === '') return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : new Date(t)
}

/** 최근 등록 피드 1건 — 이름 + 구분 배지 + 등록일. 데이터 도메인과 무관한 표시 계약. */
export interface RecentItem {
  id: string
  name: string
  createdAt: string | null | undefined
  badge: { label: string; tone: BadgeTone }
}

/**
 * 최근 등록 피드(공용) — 주(월~일) 단위로 페이징한다. `‹ ›`로 이전/다음 주를 오가며
 * "언제부터 언제까지 몇 건 등록됐는지"를 헤더에 요약하고, 아래에 해당 주 등록 항목을
 * 등록일 내림차순으로 나열한다(행 클릭 시 상세 이동). STARTUP 최근 등록 기업과 NETWORKS
 * 최근 등록 네트워크가 동일 컴포넌트를 공유한다. 데이터가 있는 최신 주에서 시작한다.
 */
export function RecentRegisteredFeed({
  items,
  onOpen,
  emptyLabel = '표시할 데이터가 없습니다.',
}: {
  items: RecentItem[]
  onOpen: (id: string) => void
  emptyLabel?: string
}) {
  // 등록일이 유효한 항목만 남긴다.
  const dated = useMemo(
    () =>
      items
        .map((it) => ({ item: it, at: parseDate(it.createdAt) }))
        .filter((x): x is { item: RecentItem; at: Date } => x.at !== null),
    [items],
  )

  // 데이터가 걸친 최신·최초 주 월요일(내비게이션 범위).
  const bounds = useMemo(() => {
    let min: Date | null = null
    let max: Date | null = null
    for (const { at } of dated) {
      if (min === null || at < min) min = at
      if (max === null || at > max) max = at
    }
    if (min === null || max === null) return null
    return { latest: weekStart(max), earliest: weekStart(min) }
  }, [dated])

  // offset: 0 = 최신 주, 음수 = 과거 주. 표시 시 범위로 clamp한다.
  const [offset, setOffset] = useState(0)

  if (!bounds) {
    return <p className="py-8 text-center text-caption text-gray-500">{emptyLabel}</p>
  }

  const totalWeeks = Math.round((bounds.latest.getTime() - bounds.earliest.getTime()) / (7 * DAY_MS))
  const clamped = Math.min(0, Math.max(-totalWeeks, offset))
  const start = addDays(bounds.latest, clamped * 7)
  const end = addDays(start, 7)

  const inWeek = dated
    .filter((x) => x.at >= start && x.at < end)
    .sort((a, b) => b.at.getTime() - a.at.getTime())

  const canOlder = clamped > -totalWeeks
  const canNewer = clamped < 0
  const goOlder = () => setOffset(Math.max(-totalWeeks, clamped - 1))
  const goNewer = () => setOffset(Math.min(0, clamped + 1))

  const navBtn =
    'grid size-7 shrink-0 place-items-center rounded-radius-sm text-gray-400 transition-colors duration-fast hover:bg-gray-100 hover:text-gray-700 disabled:pointer-events-none disabled:opacity-40'

  return (
    <div>
      {/* 주 선택 헤더 — 스크롤 시 상단에 고정 */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-gray-200 bg-white pb-2">
        <button type="button" onClick={goOlder} disabled={!canOlder} aria-label="이전 주" className={navBtn}>
          <ChevronLeft className="size-4" />
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate text-caption font-semibold text-gray-800 tabular-nums">
            {fmtDate(start)} ~ {fmtDate(addDays(end, -1))}
          </p>
          <p className="text-caption text-gray-600">
            {clamped === 0 ? '이번 주' : `${-clamped}주 전`} ·{' '}
            <span className="font-semibold tabular-nums text-gray-600">{inWeek.length}</span>건 등록
          </p>
        </div>
        <button type="button" onClick={goNewer} disabled={!canNewer} aria-label="다음 주" className={navBtn}>
          <ChevronRight className="size-4" />
        </button>
      </div>

      {inWeek.length === 0 ? (
        <p className="py-8 text-center text-caption text-gray-500">이 주에 등록된 항목이 없습니다.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {inWeek.map(({ item }) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                className="flex w-full items-center gap-2 rounded-radius-sm px-2 py-1.5 text-left hover:bg-gray-50"
              >
                {/* 이름 + 구분 배지를 한 덩어리로 왼쪽에 묶고, 등록일만 오른쪽으로 민다(짧은 이름의 가운데 빈틈 제거). */}
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="min-w-0 truncate text-caption font-medium text-gray-900" title={item.name}>
                    {item.name}
                  </span>
                  <Badge tone={item.badge.tone} className="shrink-0">
                    {item.badge.label}
                  </Badge>
                </span>
                <span className="shrink-0 text-caption tabular-nums text-gray-600">
                  {String(item.createdAt ?? '').slice(0, 10) || '-'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
