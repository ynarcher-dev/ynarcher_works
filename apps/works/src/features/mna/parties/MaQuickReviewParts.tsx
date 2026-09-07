import { EmptyValue, cardText } from '@ynarcher/ui'

/**
 * 퀵 리뷰의 여러 절이 함께 쓰는 조각 셋 — 줄 목록 · 단서 한 줄 · 숫자 표기.
 *
 * 절마다 다시 쓰지 않는 이유는 줄 수가 아니라 **규격**이다. 불릿의 들여쓰기와 단서 줄의 색이
 * 절마다 조금씩 갈리면, 같은 문서 안에서 같은 성격의 값이 다른 무게로 읽힌다.
 */

/** 줄 목록. 비면 아무것도 세우지 않는다(빈 목록에 '없음'을 찍으면 그 글자가 값이 된다). */
export function QrBullets({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null
  return (
    <ul className="mt-2 ml-4 list-disc space-y-1 pl-1">
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
  return <p className={`mt-2 ${cardText.meta}`}>주) {text}</p>
}

/**
 * 백만원 단위 숫자 한 칸.
 *
 * 음수는 국내 재무 표 관례대로 앞에 '-'를 붙인다(괄호 표기를 쓰지 않는 이유는 표의 다른 칸과
 * 자릿수 정렬이 어긋나기 때문이다 — 이 표는 `tabular-nums`로 세로를 맞춘다).
 */
export function million(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return '-'
  return Math.round(Number(v)).toLocaleString()
}

/** 비율 한 칸. 소수 첫째 자리까지 — 문서의 표기 관례이고, 그보다 잘게 쓰면 노이즈다. */
export function percent(v: number | null): string | null {
  if (v == null || !Number.isFinite(v)) return null
  return `${v.toFixed(1)}%`
}

/**
 * 값과 비율을 한 칸에 세운다 — `18,763` 아래 `33.7%`.
 *
 * 두 줄로 쌓는 이유는 문서가 그렇게 인쇄해서가 아니라 **비율이 그 값에만 딸린 값**이기
 * 때문이다. 열을 갈라 두면 표의 열이 배로 늘어 회계연도가 화면 밖으로 밀린다.
 * 비율은 저장되지 않고 매번 계산된다(quickReview.ts).
 */
export function AmountWithRate({ value, rate }: { value: number | null; rate: number | null }) {
  if (value == null && rate == null) return <EmptyValue />
  return (
    <span className="block text-right tabular-nums">
      <span className="block">{million(value)}</span>
      {rate != null && <span className={`block ${cardText.meta}`}>{percent(rate)}</span>}
    </span>
  )
}
