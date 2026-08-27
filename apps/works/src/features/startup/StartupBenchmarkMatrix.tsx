import { Badge, cn, tableTextScale } from '@ynarcher/ui'
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

/**
 * 열 경계선.
 *
 * 항목열과 첫 기업 사이는 한 단 진하게 긋는다 — 왼쪽은 행의 이름이고 오른쪽은 값이라,
 * 기업과 기업 사이(같은 층)보다 더 큰 경계다. 이 선이 없던 동안에는 텍스트 행은 왼쪽,
 * 숫자 행은 오른쪽에 붙어 정렬돼 어느 값이 어느 기업 것인지 눈으로 이을 수 없었다.
 */
const COLUMN_RULE = 'border-l border-gray-200'
const HEADER_RULE = 'border-l border-gray-300'

/**
 * 글자 위계는 **페이지에 직접 놓인 표**(14px) 단계를 쓴다. 이 표는 카드 안이 아니라 목록
 * 화면의 표와 같은 자리에 서므로, 크기를 가르는 것은 중요도가 아니라 놓이는 자리라는 원칙
 * (densityScale.ts)을 그대로 따른다.
 */
const text = tableTextScale.page

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
      <p className={cn('w-full truncate', text.primary)}>{record.name}</p>
      {industries.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1">
          {industries.slice(0, 2).map((ind) => (
            <Badge key={ind} tone="neutral">
              {ind}
            </Badge>
          ))}
        </div>
      )}
      <span className={cn(text.meta, year == null && text.empty)}>
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
 * 세로선은 열 경계를 눈으로 잇게 하는 유일한 장치다 — 텍스트 행은 왼쪽, 숫자 행은 오른쪽에
 * 붙어 정렬되므로 선이 없으면 한 값이 어느 기업 것인지 위아래로 이어 읽을 수 없다.
 */
export function StartupBenchmarkMatrix({ snapshots, onRemove }: Props) {
  const columns = `${LABEL_WIDTH} repeat(${snapshots.length}, minmax(${COLUMN_MIN}, 1fr))`
  // 개인정보 마스킹은 '스타트업 DB' 목록과 같은 정책을 따른다 — 구분을 고정하지 않는 화면이라
  // 콘텐츠 키도 그 목록의 것을 쓴다(ADMIN '민감정보 관리'에서 한 곳으로 제어된다).
  const masked = useMaskPolicy(startupListContentKey('all'))

  /** 기업 열 하나의 경계선 — 첫 열만 항목열과 갈리는 진한 선을 쓴다. */
  const ruleOf = (index: number) => (index === 0 ? HEADER_RULE : COLUMN_RULE)

  // 표가 자기 스크롤을 갖는다 — 기업 헤더와 항목열이 고정되려면(sticky) 스크롤 주체가
  // 페이지가 아니라 이 상자여야 한다. 세로 상한은 화면 높이에 맞춰 잡는다.
  return (
    <div className="max-h-[70vh] overflow-auto rounded-radius-md border border-gray-300 bg-white">
      <div className="min-w-full" style={{ gridTemplateColumns: columns, display: 'grid' }}>
        {/* 기업 헤더 행 — 세로 스크롤 중에도 어느 열이 어느 기업인지 남아 있어야 한다.
            좌상단 모서리는 가로·세로 양쪽으로 고정되므로 다른 고정 셀보다 위에 있어야 한다.
            같은 단계에 두면 DOM 뒤에 오는 항목열 셀이 스크롤 중 이 자리를 덮고 지나간다. */}
        <div className="sticky left-0 top-0 z-dropdown border-b border-gray-300 bg-white" />
        {snapshots.map((s, i) => (
          <div
            key={s.record.id}
            className={cn('sticky top-0 z-sticky border-b border-gray-300 bg-white pt-2', ruleOf(i))}
          >
            <Head snapshot={s} onRemove={() => onRemove(s.record.id)} />
          </div>
        ))}

        {METRIC_GROUPS.map((group) => (
          <div key={group.title} className="contents">
            {/* 그룹 밴드 — 전 열을 가로지르는 한 줄로 재무·매출·고용·투자를 확실히 가른다.
                열 경계선을 끊고 지나가므로 띄우지 않고 표에 붙여 둔다(띄우면 세로선이 두 번
                끊겨 표가 여러 덩이로 보인다). */}
            <div
              className="col-span-full flex items-center justify-between border-y border-gray-300 bg-gray-50 px-2.5 py-1.5"
              style={{ gridColumn: '1 / -1' }}
            >
              <span className={cn(text.head, 'text-gray-900')}>{group.title}</span>
              {group.unitNote && <span className={text.meta}>{group.unitNote}</span>}
            </div>

            {group.rows.map((row) => (
              <div key={row.label} className="contents">
                <div
                  className={cn(
                    'sticky left-0 z-sticky flex items-center border-b border-gray-200 bg-white py-1.5 pl-2.5 pr-2',
                    text.head,
                  )}
                >
                  {row.label}
                </div>
                {snapshots.map((s, i) => {
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
                        'flex min-w-0 items-center border-b border-gray-200 px-2.5 py-1.5',
                        numeric ? 'justify-end' : 'justify-start',
                        ruleOf(i),
                      )}
                    >
                      <span
                        className={cn(
                          'min-w-0 break-words',
                          numeric && 'tabular-nums',
                          text.body,
                          cell.empty && text.empty,
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
