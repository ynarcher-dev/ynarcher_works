import { Badge, Checkbox, cardText, cn } from '@ynarcher/ui'
import { formatBytes } from '@/features/networks/materialHooks'
import type { AiSource } from '@/features/ai/aiFillClient'
import type { AiCardGroupMeta, AiCardMeta } from '@/features/ai/aiCatalog'
import { cardCountFor, cellCount, cellOn, sourcesOf, type AiGrid } from '@/features/ai/aiGrid'
import { AiSourceState } from '@/features/ai/AiSourceState'
import type { AiExtractController } from '@/features/ai/useAiExtracts'

/**
 * 'AI 작성하기'의 자료 × 카드 격자.
 *
 * 종전의 좌우 두 목록(읽을 자료 · 작성할 카드)을 이 하나가 대신한다. 두 목록은 "무엇을
 * 읽는가"와 "무엇을 쓰는가"를 따로 물었을 뿐, 그 둘을 잇는 답(어느 자료가 어느 카드의
 * 근거인가)은 어디서도 묻지 않았다 — 고른 자료 전부가 고른 카드 전부에 들어갔다.
 *
 * **자료가 행이고 카드가 열이다**(2026-09-06 사용자 지정, 처음 구현과 뒤바뀜). 축을 이렇게
 * 두는 이유는 **긴 쪽을 세로로 흘려보내기 위해서**다. 카드는 몇으로 고정이고 이름이 짧지만,
 * 자료는 몇 건이 될지 모르고 이름이 길다("25년 8월 투자예정기업 정보_주식회사 ….xlsx").
 * 자료를 열로 세우면 그 이름이 열 폭에 잘려 무엇을 고르는지 알 수 없고, 건수가 늘수록 가로로
 * 밀려나 스크롤해야 나머지가 보인다. 행으로 세우면 이름은 한 줄을 다 쓰고 늘어나는 방향은
 * 브라우저가 원래 잘하는 세로 스크롤이 된다.
 *
 * **가로로는 절대 스크롤하지 않는다**(2026-09-06 사용자 지정). 표는 `table-fixed`로 창 폭에
 * 맞춰 갈라지고, 넘치는 것은 잘린다(파일 이름은 `truncate`, 전문은 커서를 올리면 답한다).
 * 그래서 열 폭은 픽셀이 아니라 **비율**이고, 고정(sticky) 칸도 두지 않는다 — 가로로 움직이지
 * 않는 표에서 따라올 것이 없다. 담기는 값이 아니라 화면 폭이 열 폭을 정하는 예외이며, 근거는
 * 카드가 언제나 함께 보여야 한다는 것이다(카드를 견주려고 여는 창이다).
 *
 * **왼쪽은 한 칸이 아니라 두 칸이다 — 파일명 · 분석 상태.** 한 칸에 세로로 쌓았더니 줄마다 두
 * 층이 되어 목록이 통째로 두 배 높이가 됐고, 그 두 층은 성격도 다르다 — 이름은 **고를 때 읽는
 * 것**이고 상태는 **누를 것이 있는지 훑는 것**이다. 열로 가르면 상태 배지가 세로로 정렬돼
 * '분석 전'인 줄만 훑어 내려갈 수 있다.
 *
 * **카드 체크박스를 따로 두지 않는다** — 한 칸이라도 켜진 카드가 작성 대상이다. 같은 값을
 * 묻는 컨트롤을 둘 두면 어느 쪽이 진짜인지 화면이 답하지 못한다.
 *
 * **카드 목록은 받아서 쓴다**(2026-09-07). 종전에는 스타트업 열두 카드를 모듈에서 직접 읽고
 * 원장 행(`record`)까지 함께 받아 `card.filled(record)`를 호출했다 — 그 한 줄 때문에 이
 * 컴포넌트가 스타트업 원장의 모양을 알아야 했다. 지금은 값이 있는지를 **소유자가 미리
 * 판정해** 넘긴다(카탈로그의 `filled`). 무엇이 채워졌는지는 그 값을 가진 쪽만 답할 수 있다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.2
 */

/**
 * 왼쪽 네 칸의 폭 — 파일명 19% · 형식 4.5% · 용량 6% · 분석 상태 8.5%.
 *
 * 파일명이 가장 넓지만 그마저 5분의 1로 묶는다. 이름은 잘려도 커서로 답할 수 있지만, 카드
 * 열은 잘리면 무엇을 켜는 칸인지 알 수 없다. 나머지 셋은 담기는 값의 **가장 긴 경우**에
 * 맞춘다(형식 `XLSX`, 용량 `999 KB`, 상태 `재분석 필요` + 아이콘) — 값이 짧은 칸을 넓게
 * 두면 그 여백만큼 카드 열이 좁아지고, 좁아지는 쪽은 언제나 잘리면 안 되는 쪽이다.
 */
const NAME_COL = 'w-[19%]'
const EXT_COL = 'w-[4.5%]'
const SIZE_COL = 'w-[6%]'
const STATE_COL = 'w-[8.5%]'

/**
 * 카드 열의 폭은 **남는 폭을 카드 수로 나눈 값**이다.
 *
 * 종전에는 `w-[5.1%]` 한 값이 상수로 박혀 있었다(열두 카드 × 5.1 ≈ 62). 카드 수가 대상마다
 * 다르면 그 상수는 한 대상에서만 맞고 나머지에서는 표가 넘치거나 오른쪽이 빈다. 값을
 * Tailwind 클래스로 만들지 않는 것은 클래스 이름을 실행 중에 조립하면 빌드가 그 클래스를
 * 만들어 내지 못해 폭이 통째로 사라지기 때문이다 — 계산된 폭은 인라인 스타일이 갖는다.
 */
const LEFT_COLS_PCT = 19 + 4.5 + 6 + 8.5

function cardColWidth(count: number): string {
  return `${(100 - LEFT_COLS_PCT) / Math.max(count, 1)}%`
}

/**
 * 파일 이름에서 **확장자를 떼어 낸다**(2026-09-06 사용자 지정).
 *
 * 떼는 이유는 두 값의 성격이 다르기 때문이다 — 이름은 잘려도 되는 긴 값이고(전문은 커서가
 * 답한다), 형식과 용량은 짧고 언제나 끝까지 보여야 하는 값이라 **각자 칸을 갖는다**. 한 칸에
 * 이어 붙이면 잘리는 쪽이 뒤에 붙은 형식·용량이 되어, 정작 무엇을 여는지(PDF인지 엑셀인지)가
 * 먼저 사라진다. 같은 값을 두 곳에 적지 않으므로 왼쪽 이름에서는 확장자가 빠진다.
 */
function splitName(name: string): { base: string; ext: string | null } {
  const m = /^(.*)\.([A-Za-z0-9]{1,6})$/.exec(name)
  if (!m?.[1] || !m[2]) return { base: name, ext: null }
  return { base: m[1], ext: m[2].toUpperCase() }
}

/** 확장자가 없는 자료의 형식 칸 — 링크는 '링크'이고, 이름에 확장자가 없는 파일은 비운다. */
function kindLabel(source: AiSource): string {
  return source.kind === 'link' ? '링크' : ''
}

/**
 * 이 자료가 사는 곳(참조해 온 자료에만 있다).
 *
 * 이 화면 자기 자료에는 없다 — 전부에 붙이면 같은 말이 모든 줄에 서서 정작 어느 줄이 남의
 * 것인지가 그 반복에 묻힌다.
 */
function sourceOrigin(source: AiSource): string | undefined {
  return source.kind === 'attachment' ? source.origin : undefined
}

/** 커서 설명 — 잘린 이름의 전문. 참조 자료는 어디 것인지까지 답한다. */
function sourceTitle(source: AiSource): string {
  const origin = sourceOrigin(source)
  return origin ? `${origin} · ${source.name}` : source.name
}

export function AiFillGrid<K extends string>({
  sources,
  cards,
  groups,
  grid,
  onCell,
  onCard,
  onGroup,
  onSource,
  onAll,
  extracts,
}: {
  /** 읽을 수 있는 자료만 온다(못 읽는 자료는 격자에 세우지 않는다). */
  sources: AiSource[]
  /** 화면 순서대로 선 카드. 지금 값이 있는지(`filled`)도 이미 판정된 채로 온다. */
  cards: AiCardMeta<K>[]
  /** 1단 머리 — 서버가 실제로 나눠 읽는 탐색 묶음. */
  groups: AiCardGroupMeta[]
  grid: AiGrid<K>
  onCell: (card: K, key: string) => void
  /** 카드 하나가 자료 전부를 읽게 하거나 아무것도 읽지 않게 한다. */
  onCard: (card: K) => void
  /** 같은 탐색 묶음의 카드가 자료 전부를 읽게 하거나 아무것도 읽지 않게 한다. */
  onGroup: (cards: K[]) => void
  /** 자료 하나를 모든 카드에서 켜거나 끈다. */
  onSource: (key: string) => void
  onAll: () => void
  /** 자료 줄의 분석 상태와 그 줄에서 할 수 있는 일. */
  extracts: AiExtractController
}) {
  const cardKeys = cards.map((c) => c.key)
  const total = cellCount(grid, cardKeys)
  const colWidth = cardColWidth(cards.length)
  /** 묶음이 바뀌는 자리에만 세로선을 둔다 — 열마다 그으면 격자가 아니라 창살이 된다. */
  const groupEdge = (i: number) => i > 0 && cards[i - 1]?.group !== cards[i]?.group

  // 세로 높이만 여기서 잠근다 — 표가 자기 안에서 스크롤해야 머리줄이 붙어 있고, 아래 결과
  // 패널이 화면 밖으로 밀려나지 않는다. 가로(`overflow-x`)는 열지 않는다.
  return (
    <div className="max-h-[min(58vh,40rem)] overflow-y-auto overflow-x-hidden rounded-radius-md border border-gray-200">
      {/* border-collapse 대신 separate를 쓴다 — 붙인 테두리는 고정(sticky) 머리줄에서 사라진다. */}
      <table className="w-full table-fixed border-separate border-spacing-0">
        <thead>
          {/* 1단 — 서버가 실제로 나눠 읽는 탐색 묶음. 체크하면 묶음 단위로 고를 수 있다. */}
          <tr>
            <th
              scope="col"
              rowSpan={2}
              className={cn(
                NAME_COL,
                'sticky top-0 z-20 border-b border-gray-200 bg-white px-3 py-2 text-left align-bottom',
              )}
            >
              <Checkbox
                checked={total > 0}
                onChange={onAll}
                label={
                  <span className={cardText.label}>{total > 0 ? '전체 해제' : '전체 선택'}</span>
                }
              />
            </th>
            <th
              scope="col"
              rowSpan={2}
              className={cn(
                EXT_COL,
                'sticky top-0 z-20 border-b border-gray-200 bg-white px-1 py-2 text-center align-bottom',
              )}
            >
              <span className={cardText.label}>형식</span>
            </th>
            <th
              scope="col"
              rowSpan={2}
              className={cn(
                SIZE_COL,
                'sticky top-0 z-20 border-b border-gray-200 bg-white px-2 py-2 text-right align-bottom',
              )}
            >
              <span className={cardText.label}>용량</span>
            </th>
            <th
              scope="col"
              rowSpan={2}
              className={cn(
                STATE_COL,
                'sticky top-0 z-20 border-b border-r border-gray-200 bg-white px-2 py-2 text-left align-bottom',
              )}
            >
              <span className={cardText.label}>분석</span>
            </th>
            {groups.map((group) => {
              const groupCards = cards.filter((c) => c.group === group.key).map((c) => c.key)
              if (groupCards.length === 0) return null
              const picked = groupCards.some((card) => sourcesOf(grid, card).length > 0)
              return (
                <th
                  key={group.key}
                  scope="colgroup"
                  colSpan={groupCards.length}
                  className="sticky top-0 z-20 border-b border-l border-gray-200 bg-gray-25 px-2 py-1 text-center"
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <Checkbox
                      checked={picked}
                      onChange={() => onGroup(groupCards)}
                      title={`${group.label} 카드 — 자료 전부 켜기/끄기`}
                    />
                    <span className={cardText.subhead}>{group.label}</span>
                  </span>
                </th>
              )
            })}
          </tr>
          {/* 2단 — 카드. 열 머리의 체크는 그 카드가 자료 전부를 읽게 한다. */}
          <tr>
            {cards.map((card, i) => {
              const picked = sourcesOf(grid, card.key).length
              return (
                <th
                  key={card.key}
                  scope="col"
                  style={{ width: colWidth }}
                  className={cn(
                    // 1단(묶음)이 위에 서므로 그 높이만큼 내려 붙는다.
                    'sticky top-7 z-20 border-b border-gray-200 bg-white px-1 py-2 align-bottom',
                    groupEdge(i) && 'border-l border-gray-200',
                  )}
                >
                  <div className="flex flex-col items-center gap-1">
                    {/* 이름이 먼저다 — 담당자가 열에서 찾는 것은 카드 이름이고, 값이 있는지는
                        그 이름을 찾은 다음에 보는 것이다. 줄바꿈을 막지 않는다(`break-keep`을
                        걷었다) — 열이 창 폭을 나눠 갖는 이상 이름은 접혀야 하고, 한글은 기본
                        규칙으로도 음절 사이에서 접힌다. */}
                    <span className={cn('block w-full text-center', cardText.label)}>
                      {card.label}
                    </span>
                    {/* 작성 여부는 상태이므로 색을 쓴다(값이 있는 쪽만 눈에 걸리면 된다).
                        배지는 줄어들지 않으므로 좁은 열에서는 글자를 최소로 줄이고, 무엇의
                        답인지는 바로 위의 카드 이름과 커서 설명이 함께 답한다. */}
                    <Badge
                      tone={card.filled ? 'info' : 'neutral'}
                      density="table"
                      title={`${card.label} — ${card.filled ? '값 있음(작성됨)' : '비어 있음'}`}
                    >
                      {card.filled ? '있음' : '없음'}
                    </Badge>
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
            const used = cardCountFor(grid, s.key, cardKeys)
            const { base, ext } = splitName(s.name)
            const origin = sourceOrigin(s)
            return (
              <tr key={s.key} className="group">
                <th
                  scope="row"
                  className={cn(
                    NAME_COL,
                    'border-b border-gray-100 px-3 py-1.5 text-left group-hover:bg-gray-25',
                  )}
                >
                  <Checkbox
                    checked={used > 0}
                    onChange={() => onSource(s.key)}
                    // 라벨 래퍼가 줄어들 수 있어야 안쪽 이름이 잘린다 — `min-w-0`이 없으면
                    // 이름이 칸을 밀어내 표가 가로로 넘친다.
                    wrapperClassName="w-full min-w-0"
                    // 이름은 잘리고(말줄임), 전체 이름은 커서를 올리면 답한다.
                    //
                    // 참조해 온 자료에는 위치가 이름 앞에 붙는다(2026-09-08). **줄을 늘리지
                    // 않고 같은 한 줄에 세우는 것**이 요점이다 — 이 표는 줄마다 두 층이 되면
                    // 통째로 두 배 높이가 되므로(위 주석), 크기를 갈라 위계를 만들지 않고
                    // 색만 한 단 물러난다.
                    label={
                      <span className="block min-w-0 truncate" title={sourceTitle(s)}>
                        {origin && <span className="text-gray-500">{origin} · </span>}
                        {base}
                      </span>
                    }
                  />
                </th>
                <td
                  className={cn(
                    EXT_COL,
                    'border-b border-gray-100 px-1 py-1.5 text-center group-hover:bg-gray-25',
                  )}
                >
                  <span className={cn('block truncate', cardText.meta)}>{ext ?? kindLabel(s)}</span>
                </td>
                <td
                  className={cn(
                    SIZE_COL,
                    'border-b border-gray-100 px-2 py-1.5 text-right group-hover:bg-gray-25',
                  )}
                >
                  {/* 링크에는 용량이 없다. '-'는 모른다는 뜻이라 사실과 달라 아예 비운다. */}
                  <span className={cn('block truncate tabular-nums', cardText.meta)}>
                    {s.bytes != null ? formatBytes(s.bytes) : ''}
                  </span>
                </td>
                <td
                  className={cn(
                    STATE_COL,
                    'border-b border-r border-gray-100 px-2 py-1.5 group-hover:bg-gray-25',
                  )}
                >
                  <AiSourceState
                    source={s}
                    status={extracts.statusOf(s)}
                    forcedOriginal={extracts.isForcedOriginal(s.key)}
                    disabled={extracts.busy}
                    onAnalyze={() => void extracts.analyze([s])}
                    onToggleOriginal={() => extracts.toggleOriginal(s.key)}
                  />
                </td>
                {cards.map((card, i) => (
                  <td
                    key={card.key}
                    style={{ width: colWidth }}
                    className={cn(
                      'border-b border-gray-100 px-1 py-1.5 text-center group-hover:bg-gray-25',
                      groupEdge(i) && 'border-l border-gray-200',
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
