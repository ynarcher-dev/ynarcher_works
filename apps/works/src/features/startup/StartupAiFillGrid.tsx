import { Badge, Checkbox, cardText, cn } from '@ynarcher/ui'
import type { EntityRow } from '@/features/master/entityHooks'
import { formatBytes } from '@/features/networks/materialHooks'
import type { AiSource } from '@/features/startup/startupAiFill'
import { AI_CARDS, type AiCardBand, type AiCardKey } from '@/features/startup/startupAiCards'
import { cellCount, cellOn, columnCount, rowKeys, type AiGrid } from '@/features/startup/startupAiGrid'

/**
 * 'AI 작성하기'의 카드 × 자료 격자.
 *
 * 종전의 좌우 두 목록(읽을 자료 · 작성할 카드)을 이 하나가 대신한다. 두 목록은 "무엇을
 * 읽는가"와 "무엇을 쓰는가"를 따로 물었을 뿐, 그 둘을 잇는 답(어느 자료가 어느 카드의
 * 근거인가)은 어디서도 묻지 않았다 — 고른 자료 전부가 고른 카드 전부에 들어갔다. 격자는
 * 그 하나를 묻는다.
 *
 * **카드 체크박스를 따로 두지 않는다** — 한 칸이라도 켜진 카드가 작성 대상이다. 같은 값을
 * 묻는 컨트롤을 둘 두면 어느 쪽이 진짜인지 화면이 답하지 못한다.
 *
 * 줄 머리·열 머리·모퉁이가 각각 한 줄·한 열·전체를 한 번에 켠다. 열넷을 하나씩 누르는 일과
 * 하나만 남기는 일이 같은 빈도로 있어, 그 자리가 없으면 어느 쪽이든 열네 번 눌러야 한다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.2
 */

/** 자료 열 하나의 폭. 이름은 잘리고 전체는 `title`이 답한다(세로로 세운 글자는 더 안 읽힌다). */
const COL = 'w-28 min-w-[7rem]'
/**
 * 카드 이름 칸 — 가로로 스크롤해도 자리에 남는다.
 *
 * 이 칸이 따라오지 않으면 오른쪽 끝의 체크박스가 어느 카드의 것인지 알 수 없다. 배경을
 * 칠하는 것은 장식이 아니라 필수다 — 투명하면 스크롤된 칸이 이 칸 밑으로 비쳐 겹쳐 보인다.
 */
const LEFT = 'sticky left-0 z-10 w-56 min-w-[14rem] bg-white group-hover:bg-gray-25'
/** 표 머리 — 세로로 스크롤해도 자료 이름이 남는다. */
const TOP = 'sticky top-0 z-20 bg-white'

export function StartupAiFillGrid({
  sources,
  record,
  grid,
  onCell,
  onRow,
  onColumn,
  onAll,
}: {
  /** 읽을 수 있는 자료만 온다(못 읽는 자료는 격자에 세우지 않는다). */
  sources: AiSource[]
  /** 지금 폼에 적힌 값. 줄의 Y/N이 이것을 읽는다. */
  record: EntityRow
  grid: AiGrid
  onCell: (card: AiCardKey, key: string) => void
  onRow: (card: AiCardKey) => void
  onColumn: (key: string) => void
  onAll: () => void
}) {
  const bands: AiCardBand[] = ['기본', '역량', '실적']
  const cards = AI_CARDS.map((c) => c.key)
  const total = cellCount(grid)

  return (
    <div className="overflow-auto rounded-radius-md border border-gray-200 lg:max-h-[26rem]">
      {/* border-collapse 대신 separate를 쓴다 — 붙인 테두리는 고정(sticky) 칸에서 사라진다. */}
      <table className="min-w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th
              scope="col"
              className={cn(LEFT, TOP, 'left-0 top-0 z-30 border-b border-r border-gray-200 px-3 py-2 text-left')}
            >
              <Checkbox
                checked={total > 0}
                onChange={onAll}
                label={<span className={cardText.label}>{total > 0 ? '전체 해제' : '전체 선택'}</span>}
              />
            </th>
            {sources.map((s) => (
              <th
                key={s.key}
                scope="col"
                className={cn(COL, TOP, 'border-b border-gray-200 px-2 py-2 align-bottom')}
                // 이름이 잘리므로 전체 이름과 크기는 커서를 올리면 답한다.
                title={s.bytes != null ? `${s.name} (${formatBytes(s.bytes)})` : s.name}
              >
                <div className="flex flex-col items-start gap-1">
                  <Checkbox
                    checked={columnCount(grid, s.key, cards) > 0}
                    onChange={() => onColumn(s.key)}
                    title={`${s.name} — 모든 카드에 켜기/끄기`}
                  />
                  <span className={cn('block w-full truncate text-left', cardText.meta)}>{s.name}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bands.map((band) => (
            <BandRows
              key={band}
              band={band}
              sources={sources}
              record={record}
              grid={grid}
              onCell={onCell}
              onRow={onRow}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** 한 밴드(기본·역량·실적)의 줄들. 상세 화면과 같은 세로 축이라 화면과 순서가 같다. */
function BandRows({
  band,
  sources,
  record,
  grid,
  onCell,
  onRow,
}: {
  band: AiCardBand
  sources: AiSource[]
  record: EntityRow
  grid: AiGrid
  onCell: (card: AiCardKey, key: string) => void
  onRow: (card: AiCardKey) => void
}) {
  return (
    <>
      <tr className="group">
        <th scope="rowgroup" className={cn(LEFT, 'border-b border-r border-gray-200 px-3 py-1 text-left')}>
          <span className={cardText.subhead}>{band}</span>
        </th>
        <td className="border-b border-gray-200 bg-gray-25" colSpan={sources.length} />
      </tr>
      {AI_CARDS.filter((c) => c.band === band).map((card) => {
        const picked = rowKeys(grid, card.key).length
        const filled = card.filled(record)
        return (
          <tr key={card.key} className="group">
            <th scope="row" className={cn(LEFT, 'border-b border-r border-gray-100 px-3 py-1.5 text-left')}>
              <div className="flex items-center justify-between gap-2">
                <Checkbox
                  checked={picked > 0}
                  onChange={() => onRow(card.key)}
                  label={<span className="block min-w-0 truncate">{card.label}</span>}
                />
                <span className="flex shrink-0 items-center gap-1.5">
                  {/* 몇 건을 읽는지가 이 줄의 상태다 — 절반만 켜진 줄을 체크 하나로는 말하지 못한다. */}
                  {picked > 0 && (
                    <span className={cardText.meta}>
                      {picked}/{sources.length}
                    </span>
                  )}
                  {/* 작성 여부는 상태이므로 색을 쓴다(값이 있는 쪽만 눈에 걸리면 된다). */}
                  <Badge
                    tone={filled ? 'info' : 'neutral'}
                    density="table"
                    title={filled ? '값 있음' : '비어 있음'}
                  >
                    {filled ? 'Y' : 'N'}
                  </Badge>
                </span>
              </div>
            </th>
            {sources.map((s) => (
              <td
                key={s.key}
                className="border-b border-gray-100 px-2 py-1.5 text-center group-hover:bg-gray-25"
              >
                <Checkbox
                  checked={cellOn(grid, card.key, s.key)}
                  onChange={() => onCell(card.key, s.key)}
                  title={`${card.label} ← ${s.name}`}
                />
              </td>
            ))}
          </tr>
        )
      })}
    </>
  )
}
