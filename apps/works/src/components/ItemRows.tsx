import { Button, cardText } from '@ynarcher/ui'
import { Fragment, type ReactNode } from 'react'

/**
 * 목록형 입력 한 벌 — **머리글 한 줄 + 항목 한 줄씩**.
 *
 * 2026-09-09 사용자 지정으로 세웠다. 그 전까지 이 폼 안에는 목록 입력이 **네 가지 모양**으로
 * 살고 있었다: 한 줄짜리(강점·추가 사실), 줄 표(매출·재무·고용), 고정폭 flex(주주), 그리고
 * **항목 상자 2열**(인증·팀원·지식재산·트랙션·투자, M&A 주주·지표·제품). 마지막 것이 문제였다 —
 * 값이 둘뿐인 항목(지표 이름·값)이 라벨 두 줄과 삭제 한 줄을 더해 **네 줄**을 썼다. 라벨을
 * 항목마다 다시 적기 때문이고, 그 반복이 곧 화면에 남는 여백이었다.
 *
 * 상자를 걷는다. 상자가 있던 이유는 2026-09-06에 편집 카드가 절반 폭이 되면서 칸이 화면마다
 * 다른 자리에서 접혔기 때문인데, 2026-09-09에 카드를 전폭 1열로 되돌리면서 그 이유가 사라졌다.
 *
 * **열 폭은 화면이 아니라 담기는 값의 종류가 정한다**(`ItemColKind`). 시점·선택지·번호·금액은
 * 폭이 정해져 있고, 이름·명칭·내용처럼 길이를 모르는 값이 남는 폭을 전부 가져간다. 그래야 항목이
 * 몇이든 열이 세로로 맞아 위아래 값을 눈으로 견줄 수 있다 — 폼의 `FieldGrid`가 *칸의 종류가
 * 폭을 정한다*고 한 것과 같은 규칙이고, 여기서는 그 종류가 목록 한 줄에 맞게 잘게 갈렸을 뿐이다.
 *
 * 좁은 화면에서는 **접지 않고 가로로 스크롤한다**(2026-09-09 사용자 지정). 접으면 화면 폭에 따라
 * 한 항목이 1줄이었다 3줄이었다 해서, 상자를 걷은 이유가 그대로 돌아온다.
 */
export type ItemColKind =
  /** 사람·회사 이름처럼 짧고 길이가 대체로 정해진 값. */
  | 'name'
  /** 명칭·내용처럼 길이를 모르는 값. 남는 폭을 전부 가져간다(둘 이상이면 나눠 갖는다). */
  | 'text'
  /** 날짜·기준월. */
  | 'date'
  /** 고정 선택지. */
  | 'pick'
  /** 번호·기간처럼 형식이 정해진 문자열. */
  | 'code'
  /** 연도·단위처럼 서너 글자로 끝나는 값. */
  | 'short'
  /** 금액·수치(우측정렬 입력이 들어온다). */
  | 'num'
  /** 체크박스 한 칸. */
  | 'flag'

/** 종류별 고정 폭(rem). `text`는 여기 없다 — 남는 폭을 받는다. */
const COL_WIDTH: Record<Exclude<ItemColKind, 'text'>, number> = {
  name: 10,
  date: 9.5,
  pick: 8.5,
  code: 10,
  num: 9,
  short: 6,
  flag: 5.5,
}

/** `text` 열이 가로 스크롤 없이 최소한 확보하는 폭(rem). */
const TEXT_MIN = 12

/** 삭제 버튼 열의 폭(rem) — 최소 폭 계산에만 쓴다(실제 열은 `auto`). */
const ACTION_WIDTH = 4.5

export interface ItemCol {
  /** 머리글에 한 번 서는 이름. */
  label: string
  /** 이 열에 담기는 값의 종류. 생략하면 `text`. */
  kind?: ItemColKind
}

interface Props<T> {
  cols: readonly ItemCol[]
  /** 항목들. 화면은 이 배열을 그대로 넘기고, 한 줄을 그릴 때 그 항목을 돌려받는다. */
  rows: readonly T[]
  /**
   * 줄의 React key. 기본은 순번이지만, `useFieldArray`로 만든 목록은 **반드시 그 행의 id**를
   * 넘긴다 — 순번을 키로 쓰면 가운데 항목을 지웠을 때 아래 줄의 DOM 값이 위로 밀려 붙는다.
   */
  rowKey?: (row: T, i: number) => string | number
  onRemove: (i: number) => void
  onAdd: () => void
  addLabel: string
  /** 한 카드에 목록이 둘 이상일 때의 소제목(인증 / 정부과제). */
  title?: string
  /**
   * 한 줄의 칸들. **`cols`와 같은 수·같은 순서**로 내놓아야 한다 — 머리글이 그 순서로 서 있고,
   * 어긋나면 값이 다른 이름 아래에 선다.
   */
  children: (row: T, i: number) => ReactNode
}

/**
 * 목록형 입력.
 *
 * 항목이 없으면 머리글도 서지 않는다 — 채울 것이 없는데 열 이름만 서 있으면 그것이 값의 자리인지
 * 안내인지 화면이 말하지 못한다. 남는 것은 추가 버튼 하나다.
 */
export function ItemRows<T>({ cols, rows, rowKey, onRemove, onAdd, addLabel, title, children }: Props<T>) {
  const tracks = cols.map((c) => {
    const kind = c.kind ?? 'text'
    return kind === 'text' ? 'minmax(0,1fr)' : `${COL_WIDTH[kind]}rem`
  })
  const fixed = cols.reduce((sum, c) => {
    const kind = c.kind ?? 'text'
    return sum + (kind === 'text' ? TEXT_MIN : COL_WIDTH[kind])
  }, ACTION_WIDTH)

  return (
    <div className="space-y-2">
      {title && <h3 className={cardText.subhead}>{title}</h3>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <div
            // `[&>*]:min-w-0` — 격자 칸의 기본 최소 폭은 '내용이 요구하는 폭'이라, 입력 하나의
            // 기본 너비(약 20자)가 열 폭보다 커지면 표 전체가 밀린다. 칸마다 0으로 풀어 둔다.
            className="grid items-center gap-x-2 gap-y-1.5 [&>*]:min-w-0"
            style={{ gridTemplateColumns: `${tracks.join(' ')} auto`, minWidth: `${fixed}rem` }}
          >
            {cols.map((c, i) => (
              <span key={i} className="text-caption text-gray-700">
                {c.label}
              </span>
            ))}
            <span aria-hidden />
            {rows.map((row, i) => (
              <Fragment key={rowKey ? rowKey(row, i) : i}>
                {children(row, i)}
                <Button type="button" variant="secondary" className="shrink-0" onClick={() => onRemove(i)}>
                  삭제
                </Button>
              </Fragment>
            ))}
          </div>
        </div>
      )}
      <Button type="button" variant="outline" onClick={onAdd}>
        {addLabel}
      </Button>
    </div>
  )
}

/**
 * 목록의 한 항목만 고친 새 배열. 목록을 쓰는 화면마다 같은 map을 다시 적지 않는다.
 */
export function patchAt<T>(rows: readonly T[], i: number, patch: Partial<T>): T[] {
  return rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
}

/** 목록에서 한 항목을 뺀 새 배열. */
export function removeAt<T>(rows: readonly T[], i: number): T[] {
  return rows.filter((_, idx) => idx !== i)
}
