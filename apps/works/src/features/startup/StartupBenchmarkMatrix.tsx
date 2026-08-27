import { Badge, cn, tableText } from '@ynarcher/ui'
import { X } from 'lucide-react'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { maskName } from '@/lib/mask'
import { useMaskPolicy } from '@/features/admin/sensitiveStore'
import { startupListContentKey } from '@/features/startup/startupClassification'
import { readIndustries } from '@/features/startup/startupGrowth'
import {
  METRIC_GROUPS,
  formatCell,
  type CompanySnapshot,
} from '@/features/startup/benchmarkMetrics'

/** 열 하나의 최소 폭. 로고·기업명·일곱 자리 금액이 잘리지 않는 하한이다. */
const COLUMN_MIN = '9.5rem'
/** 항목 라벨 열 폭. 가로 스크롤 중에도 왼쪽에 붙어 있어야 어느 행인지 알 수 있다. */
const LABEL_WIDTH = '6.5rem'

/** 기업 헤더 한 칸(로고·이름·분야·기준연도·해제). 표의 첫 행이라 열 폭을 여기서 함께 정한다. */
function Head({ snapshot, onRemove }: { snapshot: CompanySnapshot; onRemove: () => void }) {
  const { record, year } = snapshot
  const industries = readIndustries(record)
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 px-2 pb-2 text-center">
      <div className="relative">
        <PhotoBox src={record.logo_url ? String(record.logo_url) : null} className="size-11 rounded-radius-md" />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${record.name} 비교에서 빼기`}
          className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-danger text-white shadow-popover transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10"
        >
          <X className="size-3" strokeWidth={3} aria-hidden />
        </button>
      </div>
      <p className={cn('w-full truncate', tableText.primary)}>{record.name}</p>
      {industries.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1">
          {industries.slice(0, 2).map((ind) => (
            <Badge key={ind} tone="neutral">
              {ind}
            </Badge>
          ))}
        </div>
      )}
      <span className={cn(tableText.meta, year == null && tableText.empty)}>
        {year != null ? `${year}년 기준` : '실적 없음'}
      </span>
    </div>
  )
}

interface Props {
  snapshots: CompanySnapshot[]
  onRemove: (id: string) => void
}

/**
 * 벤치마크 비교 매트릭스 — 왼쪽 고정 항목열 + 기업 N열.
 *
 * 좌우 비교 카드의 `A값 · 항목 · B값`(중앙 라벨) 문법은 두 기업 전용이라, 셋 이상을 세우려면
 * 항목을 왼쪽으로 옮겨 행 머리로 쓰는 전치 매트릭스가 되어야 한다. 항목 목록은 화면이 아니라
 * `METRIC_GROUPS`가 소유하므로, 열이 늘어도 이 컴포넌트는 그대로다.
 *
 * 글자 규격은 직접 적지 않고 `tableText`(카드 안 표 단계)를 경유한다 — 손수 만든 목록이지만
 * 놓이는 자리는 카드 안이므로 변동 이력·자료 목록과 같은 위계를 공유해야 한다.
 */
export function StartupBenchmarkMatrix({ snapshots, onRemove }: Props) {
  const columns = `${LABEL_WIDTH} repeat(${snapshots.length}, minmax(${COLUMN_MIN}, 1fr))`
  // 개인정보 마스킹은 '스타트업 DB' 목록과 같은 정책을 따른다 — 구분을 고정하지 않는 화면이라
  // 콘텐츠 키도 그 목록의 것을 쓴다(ADMIN '민감정보 관리'에서 한 곳으로 제어된다).
  const masked = useMaskPolicy(startupListContentKey('all'))

  // 표가 자기 스크롤을 갖는다 — 기업 헤더와 항목열이 고정되려면(sticky) 스크롤 주체가
  // 페이지가 아니라 이 상자여야 한다. 세로 상한은 화면 높이에 맞춰 잡는다.

  return (
    <div className="max-h-[70vh] overflow-auto">
      <div className="min-w-full" style={{ gridTemplateColumns: columns, display: 'grid' }}>
        {/* 기업 헤더 행 — 세로 스크롤 중에도 어느 열이 어느 기업인지 남아 있어야 한다. */}
        {/* 좌상단 모서리 — 가로·세로 양쪽으로 고정되므로 다른 고정 셀보다 위에 있어야 한다.
            같은 단계에 두면 DOM 뒤에 오는 항목열 셀이 스크롤 중 이 자리를 덮고 지나간다. */}
        <div className="sticky left-0 top-0 z-dropdown border-b border-gray-300 bg-white" />
        {snapshots.map((s) => (
          <div key={s.record.id} className="sticky top-0 z-sticky border-b border-gray-300 bg-white pt-1">
            <Head snapshot={s} onRemove={() => onRemove(s.record.id)} />
          </div>
        ))}

        {METRIC_GROUPS.map((group) => (
          <div key={group.title} className="contents">
            {/* 그룹 밴드 — 전 열을 가로지르는 한 줄로 재무·매출·고용·투자를 확실히 가른다. */}
            <div
              className="col-span-full mt-2 flex items-center justify-between rounded-radius-sm bg-gray-50 px-2.5 py-1"
              style={{ gridColumn: '1 / -1' }}
            >
              <span className={cn(tableText.head, 'text-gray-900')}>{group.title}</span>
              {group.unitNote && <span className={tableText.meta}>{group.unitNote}</span>}
            </div>

            {group.rows.map((row) => (
              <div key={row.label} className="contents">
                <div
                  className={cn(
                    'sticky left-0 z-sticky flex items-center border-b border-gray-200 bg-white py-1.5 pr-2',
                    tableText.head,
                  )}
                >
                  {row.label}
                </div>
                {snapshots.map((s) => {
                  const raw = row.read(s)
                  const shown =
                    row.sensitive === 'name' && masked.name && typeof raw === 'string'
                      ? maskName(raw)
                      : raw
                  const cell = formatCell(row.kind, shown, '정보 없음')
                  const numeric = row.kind !== 'text'
                  return (
                    <div
                      key={s.record.id}
                      className={cn(
                        'flex min-w-0 items-center border-b border-gray-200 px-2 py-1.5',
                        numeric ? 'justify-end' : 'justify-start',
                      )}
                    >
                      <span
                        className={cn(
                          'min-w-0 break-words',
                          numeric && 'tabular-nums',
                          tableText.body,
                          cell.empty && tableText.empty,
                          cell.negative && 'text-info',
                        )}
                      >
                        {cell.text}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
