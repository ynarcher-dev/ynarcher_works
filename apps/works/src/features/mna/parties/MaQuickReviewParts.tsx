import { DataTable, EmptyValue, cardText, cn, type Column } from '@ynarcher/ui'
import type { ReactNode } from 'react'

/**
 * 퀵 리뷰의 여러 절이 함께 쓰는 조각 — 강조 블록 · 카드 안 소표 · 줄 목록 · 단서 한 줄 · 숫자 표기.
 *
 * 절마다 다시 쓰지 않는 이유는 줄 수가 아니라 **규격**이다. 불릿의 들여쓰기와 단서 줄의 색이
 * 절마다 조금씩 갈리면, 같은 문서 안에서 같은 성격의 값이 다른 무게로 읽힌다.
 */

/**
 * 문서의 첫 줄이 서는 강조 블록.
 *
 * 색은 STARTUP 상세의 '요약' 3카드와 같은 언어를 쓴다 — 옅은 표면(`subtle`)과 같은 축의
 * 테두리(`DEFAULT`)를 짝지어, 테두리와 면이 서로 다른 신호로 읽히지 않게 한다.
 *
 * **색을 쓰는 것 자체가 규칙(색은 상태에만)의 예외**이고, 예외인 근거도 그쪽과 같다 — 아래
 * 칸들이 사실을 나열하는 동안 이 한 줄만 **판단**이다. 무엇을 하는 회사이고 왜 이 건을 보고
 * 있는지를 사람이 한 문장으로 답한 자리라, 색이 그 성격 차이를 말한다.
 *
 * 톤은 `success`다(2026-09-08 사용자 지정). 예외로 쓰는 색이라 어느 톤을 고르든 상태를 뜻하지
 * 않지만, 이 자리에는 STARTUP 요약의 첫 축(강점)과 같은 색이 서는 편이 두 화면을 오가는 눈에
 * 일관된다.
 *
 * 안에 라벨('요약')을 얹지 않는다. 이 블록이 카드 안에서 홀로 다른 면을 갖는 것 자체가 이미
 * "이건 요약이다"라고 말하고 있어서, 라벨을 붙이면 정작 그 한 줄보다 라벨이 먼저 읽힌다.
 */
export function QrLede({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <div className="rounded-radius-md border border-success bg-success-subtle p-4">
      <p className={`${cardText.value} font-semibold`}>{text}</p>
    </div>
  )
}

/**
 * 절에 붙은 이미지(조회) — 한 줄에 두 장까지 눕는 격자.
 *
 * 캐러셀로 만들지 않았다. 물건 사진은 같은 물건을 여러 각도로 찍은 것이라 한 자리에서 넘겨
 * 보는 편이 맞지만(자산 원장), 여기 그림은 **문서의 본문**이다 — 서비스 화면과 사업 구조도는
 * 서로 다른 것을 말하므로 넘김 버튼 뒤에 두면 둘째 장부터는 아무도 보지 않는다.
 *
 * 틀의 높이는 상한만 두고 비율은 그림이 정한다(`object-contain`). 고정 비율 틀에 넣으면 세로로
 * 긴 구조도가 잘리거나 위아래에 큰 여백이 남는데, 여기 들어오는 그림은 캡처·도표라 비율이
 * 제각각이다. 상한을 두는 것은 아주 긴 한 장이 그 절의 문장을 스크롤 아래로 밀어내지 않게
 * 하기 위해서다.
 *
 * **한 줄에 두 장까지다**(2026-09-08 사용자 지정). 세로로만 쌓던 동안 한 장이 카드 폭을 통째로
 * 받았고, 가로로 긴 배너가 높이 상한에 걸려 좌우에 큰 빈자리를 남겼다. 칸을 반으로 나누면 그
 * 폭에서 대부분의 그림이 상한에 닿지 않아 빈자리가 사라진다.
 *
 * 홀수일 때 **첫 장이 두 칸을 받는다**. 마지막 장을 늘리는 방법도 있지만, 그러면 문서를 위에서
 * 아래로 읽는 눈이 마지막에 가서야 가장 큰 그림을 만난다 — 절의 얼굴이 되는 것은 첫 장이다.
 * (한 장 1×1 · 두 장 2×1 · 세 장 1×1+2×1 · 네 장 2×2)
 *
 * 누르면 새 탭에서 원본을 연다. Signed URL이라 주소를 그대로 열어도 권한 밖으로 새지 않고,
 * 확대 보기를 위해 이 화면에 라이트박스를 하나 더 두지 않아도 된다.
 */
export function QrImages({
  paths,
  urls,
  className,
}: {
  paths: string[]
  urls?: Record<string, string>
  className?: string
}) {
  if (paths.length === 0) return null
  // 홀수면 첫 장이 두 칸을 받는다 — 그래야 마지막 줄에 빈 칸이 남지 않는다.
  const leadFull = paths.length % 2 === 1
  return (
    <div className={cn('grid grid-cols-1 gap-2 sm:grid-cols-2', className)}>
      {paths.map((path, i) => {
        const url = urls?.[path]
        return (
          <div
            key={path}
            className={cn(
              // 같은 줄의 두 칸은 키가 큰 쪽에 맞춰 늘어난다(`h-full`). 늘어난 칸 안에서 그림을
              // 가운데에 두지 않으면 짧은 쪽 상자의 아래가 통째로 비어 테두리만 남는다.
              'flex h-full items-center justify-center overflow-hidden rounded-radius-md border border-gray-200 bg-gray-25',
              leadFull && i === 0 && 'sm:col-span-2',
            )}
          >
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                title="새 탭에서 원본 보기"
                className="block w-full"
              >
                <img src={url} alt="" className="max-h-[26rem] w-full object-contain" />
              </a>
            ) : (
              <div className="flex h-32 items-center justify-center text-caption text-gray-400">
                불러오는 중…
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * 카드 한 장 안의 **세부 항목 한 벌**(소제목 + 오른쪽 단서 + 내용).
 *
 * 카드 하나가 문서의 절 하나이고 그 안에는 성격이 다른 덩어리가 여럿 선다 — 지표 띠, 그림,
 * 서술 문단, 표, 불릿 목록. 이름을 붙이지 않으면 그것들이 이어진 한 덩어리로 읽혀, 문단이
 * 어디서 끝나고 목록이 무엇의 목록인지 화면이 답하지 못한다. **표에만 소제목을 달던 동안
 * 실제로 그랬다** — 이름 있는 것과 없는 것이 섞여 이름 없는 쪽이 카드 제목의 본문으로 읽혔다.
 *
 * 이름은 편집 폼의 라벨과 **같은 말**을 쓴다. 읽던 자리에서 그대로 고치는 화면이라, 조회의
 * '라인업 서술'이 편집에서 다른 이름이면 방금 적은 값이 어디로 갔는지 눈이 다시 찾는다.
 *
 * 오른쪽 단서(`aside`)는 그 덩어리 전체에 걸리는 조건(기준 시점·단위)이 사는 자리다. 값마다
 * 붙이면 그 글자가 숫자보다 길어지고, 소제목에 괄호로 이어 붙이면 좁은 칸에서 제목이 접힌다 —
 * 카드 헤더가 단위를 우측 액션 자리에 두는 것과 같은 규격이다.
 *
 * **위아래 여백은 갖지 않는다.** 덩어리 사이의 간격은 카드 본문(`bodyClassName="space-y-4"`)이
 * 소유한다 — 조각마다 자기 여백을 들면 어떤 조각이 서고 어떤 조각이 비었느냐에 따라 그 합이
 * 자리마다 갈린다.
 */
export function QrBlock({
  title,
  aside,
  children,
}: {
  title: string
  aside?: string | null
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className={cardText.subhead}>{title}</p>
        {aside && <span className={`shrink-0 ${cardText.subtitle}`}>({aside})</span>}
      </div>
      {children}
    </div>
  )
}

/** 세부 항목이 표인 경우. 표의 규격(번호·생성자 열을 끄는 것)이 화면마다 갈리지 않게 모은다. */
export function QrSubTable<T>({
  title,
  aside,
  columns,
  rows,
  rowKey,
  layout = 'fixed',
}: {
  title: string
  aside?: string | null
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** 열이 많아 폭을 지켜야 하는 표는 'fixed', 값이 접혀야 하는 표는 'auto'. */
  layout?: 'auto' | 'fixed'
}) {
  if (rows.length === 0) return null
  return (
    <QrBlock title={title} aside={aside}>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={rowKey}
        numbered={false}
        standardColumns={false}
        layout={layout}
      />
    </QrBlock>
  )
}

/** 줄 목록. 비면 아무것도 세우지 않는다(빈 목록에 '없음'을 찍으면 그 글자가 값이 된다). */
export function QrBullets({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null
  return (
    <ul className="ml-4 list-disc space-y-1 pl-1">
      {lines.map((line, i) => (
        <li key={i} className={cardText.value}>
          {line}
        </li>
      ))}
    </ul>
  )
}

/**
 * 절의 단서 한 줄(未감사·기준일·조정 근거).
 *
 * **접지 않는다.** 이 문서의 규칙 설명이 아니라 **값을 되읽는 줄**이라, 도움말 말풍선에 넣으면
 * 잠정 숫자가 확정 숫자로 읽힌다(CLAUDE.md 안내 접기 규칙의 예외 — 입력값 되읽기).
 * 한 단 연한 톤으로 물러나되 자리에는 남는다.
 */
export function QrNote({ text }: { text: string | null }) {
  if (!text) return null
  return <p className={cardText.meta}>주) {text}</p>
}

/**
 * 백만원 단위 숫자 **문자열**. 값이 있는 것이 확실한 자리(요약재무 한 줄)에서만 쓴다 —
 * 표의 칸은 `Million`이 받는다(빈 값의 글자와 색을 화면이 정하지 않기 위해서다).
 *
 * 음수는 국내 재무 표 관례대로 앞에 '-'를 붙인다(괄호 표기를 쓰지 않는 이유는 표의 다른 칸과
 * 자릿수 정렬이 어긋나기 때문이다 — 이 표는 `tabular-nums`로 세로를 맞춘다).
 */
export function million(v: number): string {
  if (!Number.isFinite(Number(v))) return '-'
  return Math.round(Number(v)).toLocaleString()
}

/**
 * 표 한 칸의 백만원 값.
 *
 * 비면 하이픈을 직접 찍지 않고 `EmptyValue`에 맡긴다 — 손으로 찍은 `'-'`는 값과 같은 톤이라
 * 표를 세로로 훑을 때 없는 값이 있는 값만큼 진하게 읽힌다. 같은 표 안에서 어떤 열은 손으로,
 * 어떤 열(Net debt)은 `EmptyValue`로 찍고 있던 것을 여기로 모은다.
 */
export function Million({ v }: { v: number | null | undefined }) {
  if (v == null || !Number.isFinite(Number(v))) return <EmptyValue />
  return <span className="block truncate">{million(Number(v))}</span>
}

/** 비율 한 칸. 소수 첫째 자리까지 — 문서의 표기 관례이고, 그보다 잘게 쓰면 노이즈다. */
export function percent(v: number | null): string | null {
  if (v == null || !Number.isFinite(v)) return null
  return `${v.toFixed(1)}%`
}

/*
  `AmountWithRate`(값 위 · 비율 아래를 한 칸에 쌓던 부품)는 2026-09-08에 걷었다.

  그 부품이 있던 이유는 연도를 행으로 눕힌 배치에서 비율을 열로 갈라 두면 열이 배로 늘어서였다.
  표를 원본 문서의 배치(항목 행 · 연도 열)로 되돌리자 비율이 자기 **행**을 갖게 되어 쌓을 이유가
  사라졌고, 덤으로 한 해의 이익률을 옆 해와 가로로 견줄 수 있게 됐다. 한 칸에 두 줄을 쌓는 것은
  셀의 말줄임이 걸리지 않는 자리이기도 했다(블록 자식에는 `text-overflow`가 걸리지 않는다).
*/
