import { Badge, Checkbox, cardText, cn } from '@ynarcher/ui'
import type { EntityRow } from '@/features/master/entityHooks'
import { formatBytes } from '@/features/networks/materialHooks'
import type { AiSource } from '@/features/startup/startupAiFill'
import { AI_CARDS, type AiCardBand, type AiCardKey } from '@/features/startup/startupAiCards'
import { cardCountFor, cellCount, cellOn, sourcesOf, type AiGrid } from '@/features/startup/startupAiGrid'
import { StartupAiSourceState } from '@/features/startup/StartupAiSourceState'
import type { AiExtractController } from '@/features/startup/useStartupAiExtracts'

/**
 * 'AI 작성하기'의 자료 × 카드 격자.
 *
 * 종전의 좌우 두 목록(읽을 자료 · 작성할 카드)을 이 하나가 대신한다. 두 목록은 "무엇을
 * 읽는가"와 "무엇을 쓰는가"를 따로 물었을 뿐, 그 둘을 잇는 답(어느 자료가 어느 카드의
 * 근거인가)은 어디서도 묻지 않았다 — 고른 자료 전부가 고른 카드 전부에 들어갔다.
 *
 * **자료가 행이고 카드가 열이다**(2026-09-06 사용자 지정, 처음 구현과 뒤바뀜). 축을 이렇게
 * 두는 이유는 **긴 쪽을 세로로 흘려보내기 위해서**다. 카드는 열둘로 고정이고 이름이 짧지만,
 * 자료는 몇 건이 될지 모르고 이름이 길다("25년 8월 투자예정기업 정보_주식회사 ….xlsx").
 * 자료를 열로 세우면 그 이름이 열 폭에 잘려 무엇을 고르는지 알 수 없고, 건수가 늘수록 가로로
 * 밀려나 스크롤해야 나머지가 보인다. 행으로 세우면 이름은 한 줄을 다 쓰고 늘어나는 방향은
 * 브라우저가 원래 잘하는 세로 스크롤이 된다.
 *
 * **카드 체크박스를 따로 두지 않는다** — 한 칸이라도 켜진 카드가 작성 대상이다. 같은 값을
 * 묻는 컨트롤을 둘 두면 어느 쪽이 진짜인지 화면이 답하지 못한다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.2
 */

/** 카드 열 하나의 폭. 열둘이 고정이라 이 값이 표의 가로 길이를 정한다. */
const COL = 'w-24 min-w-[6rem]'
/**
 * 자료 이름 칸 — 가로로 스크롤해도 자리에 남는다.
 *
 * 이 칸이 따라오지 않으면 오른쪽 끝의 체크박스가 어느 자료의 것인지 알 수 없다. 배경을
 * 칠하는 것은 장식이 아니라 필수다 — 투명하면 스크롤된 칸이 이 칸 밑으로 비쳐 겹쳐 보인다.
 */
const LEFT = 'sticky left-0 z-10 w-72 min-w-[18rem] bg-white group-hover:bg-gray-25'

export function StartupAiFillGrid({
  sources,
  record,
  grid,
  onCell,
  onCard,
  onSource,
  onAll,
  extracts,
}: {
  /** 읽을 수 있는 자료만 온다(못 읽는 자료는 격자에 세우지 않는다). */
  sources: AiSource[]
  /** 지금 폼에 적힌 값. 카드 열의 Y/N이 이것을 읽는다. */
  record: EntityRow
  grid: AiGrid
  onCell: (card: AiCardKey, key: string) => void
  /** 카드 하나가 자료 전부를 읽게 하거나 아무것도 읽지 않게 한다. */
  onCard: (card: AiCardKey) => void
  /** 자료 하나를 모든 카드에서 켜거나 끈다. */
  onSource: (key: string) => void
  onAll: () => void
  /** 자료 줄의 분석 상태와 그 줄에서 할 수 있는 일. */
  extracts: AiExtractController
}) {
  const bands: AiCardBand[] = ['기본', '역량', '실적']
  const cards = AI_CARDS.map((c) => c.key)
  const total = cellCount(grid)
  /** 밴드가 바뀌는 자리에만 세로선을 둔다 — 열마다 그으면 격자가 아니라 창살이 된다. */
  const bandEdge = (i: number) => i > 0 && AI_CARDS[i - 1]?.band !== AI_CARDS[i]?.band

  return (
    <div className="overflow-auto rounded-radius-md border border-gray-200 lg:max-h-[30rem]">
      {/* border-collapse 대신 separate를 쓴다 — 붙인 테두리는 고정(sticky) 칸에서 사라진다. */}
      <table className="min-w-full border-separate border-spacing-0">
        <thead>
          {/* 1단 — 밴드. 상세 화면의 세로 축(다시 재는가)이 여기서는 열 묶음이 된다. */}
          <tr>
            <th
              scope="col"
              rowSpan={2}
              className={cn(
                LEFT,
                'sticky top-0 z-30 border-b border-r border-gray-200 bg-white px-3 py-2 text-left align-bottom',
              )}
            >
              <Checkbox
                checked={total > 0}
                onChange={onAll}
                label={<span className={cardText.label}>{total > 0 ? '전체 해제' : '전체 선택'}</span>}
              />
            </th>
            {bands.map((band) => (
              <th
                key={band}
                scope="colgroup"
                colSpan={AI_CARDS.filter((c) => c.band === band).length}
                className="sticky top-0 z-20 border-b border-l border-gray-200 bg-gray-25 px-2 py-1 text-center"
              >
                <span className={cardText.subhead}>{band}</span>
              </th>
            ))}
          </tr>
          {/* 2단 — 카드. 열 머리의 체크는 그 카드가 자료 전부를 읽게 한다. */}
          <tr>
            {AI_CARDS.map((card, i) => {
              const picked = sourcesOf(grid, card.key).length
              const filled = card.filled(record)
              return (
                <th
                  key={card.key}
                  scope="col"
                  className={cn(
                    COL,
                    // 1단(밴드)이 위에 서므로 그 높이만큼 내려 붙는다.
                    'sticky top-7 z-20 border-b border-gray-200 bg-white px-2 py-2 align-bottom',
                    bandEdge(i) && 'border-l border-gray-200',
                  )}
                  title={`${card.label} — ${filled ? '값 있음' : '비어 있음'}`}
                >
                  <div className="flex flex-col items-center gap-1">
                    {/* 작성 여부는 상태이므로 색을 쓴다(값이 있는 쪽만 눈에 걸리면 된다). */}
                    <Badge tone={filled ? 'info' : 'neutral'} density="table">
                      {filled ? 'Y' : 'N'}
                    </Badge>
                    <span className={cn('block w-full break-keep text-center', cardText.meta)}>
                      {card.label}
                    </span>
                    <span className="flex items-center gap-1">
                      <Checkbox
                        checked={picked > 0}
                        onChange={() => onCard(card.key)}
                        title={`${card.label} — 자료 전부 켜기/끄기`}
                      />
                      {/* 몇 건을 읽는지가 이 카드의 상태다 — 절반만 켜진 것을 체크 하나로는
                          말하지 못한다. */}
                      {picked > 0 && <span className={cardText.meta}>{picked}</span>}
                    </span>
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const used = cardCountFor(grid, s.key, cards)
            return (
              <tr key={s.key} className="group">
                <th scope="row" className={cn(LEFT, 'border-b border-r border-gray-100 px-3 py-1.5 text-left')}>
                  {/* 이름 줄과 상태 줄을 세로로 쌓는다 — 이름이 길어 한 줄에 둘을 세우면
                      상태가 먼저 잘린다(무엇을 눌러야 하는지가 그 줄에 있다). */}
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <Checkbox
                        checked={used > 0}
                        onChange={() => onSource(s.key)}
                        // 이름이 길어 잘리므로 전체 이름은 커서를 올리면 답한다.
                        label={
                          <span className="block min-w-0 truncate" title={s.name}>
                            {s.name}
                          </span>
                        }
                      />
                      <span className="flex shrink-0 items-center gap-1.5">
                        {used > 0 && (
                          <span className={cardText.meta}>
                            {used}/{cards.length}
                          </span>
                        )}
                        {/* 링크에는 용량이 없다. '-'는 모른다는 뜻이라 사실과 달라 아예 세우지 않는다. */}
                        {s.bytes != null && <span className={cardText.meta}>{formatBytes(s.bytes)}</span>}
                      </span>
                    </div>
                    <StartupAiSourceState
                      source={s}
                      status={extracts.statusOf(s)}
                      forcedOriginal={extracts.isForcedOriginal(s.key)}
                      disabled={extracts.busy}
                      onAnalyze={() => void extracts.analyze([s])}
                      onToggleOriginal={() => extracts.toggleOriginal(s.key)}
                    />
                  </div>
                </th>
                {AI_CARDS.map((card, i) => (
                  <td
                    key={card.key}
                    className={cn(
                      'border-b border-gray-100 px-2 py-1.5 text-center group-hover:bg-gray-25',
                      bandEdge(i) && 'border-l border-gray-200',
                    )}
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
        </tbody>
      </table>
    </div>
  )
}
