// [AI 작성하기] 연도별 표의 **숫자가 서로 말이 되는가**를 본다.
//
// ## 왜 정규화와 갈라 두는가
//
// 정규화(프로파일의 validate)는 칸 하나가 규격에 맞는지를 본다 — 숫자인가, 연도인가, 0~100인가.
// 그 자리에서는 **틀린 값이 규격에는 맞는 경우**를 잡을 수 없다. 매출이 백만 배로 적힌 줄도
// 숫자이고, 같은 해가 두 번 선 표도 연도가 네 자리이며, 자산이 부채+자본과 어긋나도 셋 다 수다.
// 이 파일이 보는 것은 그 다음 층이다 — **값들이 서로 모순되지 않는가.**
//
// ## 고치지 않는다
//
// 어느 값이 틀렸는지 우리가 알 수 없다. 자산이 부채+자본과 어긋날 때 셋 중 무엇이 잘못 읽힌
// 것인지 답할 근거가 없고, 하나를 계산해 끼우면 **문서에 그렇게 적혀 있었다고 말하는 것**이
// 된다. 그래서 전부 경고만 남긴다 — 이 한 줄이 담당자가 원문을 열어 볼 신호다. AI가 값을
// 지우지 못한다는 관통 규칙과 같은 자리이며, 방향만 반대다(우리가 값을 만들지 않는다).
//
// ## 엔진에 두는 이유
//
// *어떤 칸이 자산이고 어떤 칸이 매출인가*는 프로파일이 답하고, *총계가 부분의 합과 맞는가*는
// 대상이 무엇이든 같은 물음이다. 그래서 칸 이름을 인자로 받는다 — 두 프로파일이 같은 판정을
// 각자 적으면 한쪽만 고치는 날이 오고, 그날 조용해지는 쪽은 잊힌 쪽이다.
//
// ## 경고는 아껴 쓴다
//
// 절마다 notes 줄 수에 상한이 있어(프로파일의 maxNotes) 여기서 줄을 많이 쓰면 **정작 중요한
// 경고가 밀려난다.** 그래서 판정마다 줄을 하나로 묶고(연도를 나열해 한 줄), 참일 때만 남긴다.
//
// Deno API를 쓰지 않는다(works vitest가 이 판정을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.6

import type { Warn } from './envelope.ts'

/** 연도 한 칸과 값 칸들을 가진 줄. 칸 이름은 프로파일이 정한다. */
export type YearRow = Record<string, unknown>

function numberAt(row: YearRow, field: string): number | null {
  const v = row[field]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function yearsOf(rows: YearRow[], yearField: string): number[] {
  return rows
    .map((r) => numberAt(r, yearField))
    .filter((y): y is number => y !== null && Number.isInteger(y))
}

/**
 * 연도 축의 흠 — **같은 해가 두 줄**이거나 **중간 해가 빠졌는가.**
 *
 * 둘 다 원문을 옮기다 생기는 사고다. 표에서 한 열을 건너뛰면 해가 빠지고, 같은 표를 두 번
 * 읽으면 해가 겹친다. 값 자체는 멀쩡해 보여서 **표만 봐서는 알아채지 못한다** — 2023년이
 * 빠진 줄 모르고 2022와 2024를 이어 읽으면 없는 추세가 보인다.
 *
 * 맨 앞·맨 뒤가 없는 것은 흠이 아니다(문서가 그만큼만 실었을 뿐이다). 가운데만 본다.
 */
export function checkYearSeries<K extends string>(rows: YearRow[], yearField: string, warn: Warn<K>, card: K, label: string): void {
  const years = yearsOf(rows, yearField)
  if (years.length < 2) return

  const seen = new Set<number>()
  const duplicated = new Set<number>()
  for (const y of years) {
    if (seen.has(y)) duplicated.add(y)
    seen.add(y)
  }
  if (duplicated.size > 0) {
    warn(card, `${label}에 같은 해가 두 번 있습니다(${[...duplicated].sort().join(' · ')}) — 원문 확인 필요`)
  }

  const min = Math.min(...years)
  const max = Math.max(...years)
  // 열 해를 넘겨 벌어진 표는 애초에 연속을 전제하지 않는다(오래된 한 해만 실린 경우 등).
  if (max - min > 12) return
  const missing: number[] = []
  for (let y = min + 1; y < max; y += 1) if (!seen.has(y)) missing.push(y)
  if (missing.length > 0) {
    warn(card, `${label}에 ${missing.join(' · ')}년이 빠졌습니다 — 원문 확인 필요`)
  }
}

/**
 * 이웃한 해 사이에 **자릿수가 천 배 넘게 뛰었는가** — 한 표 안에 단위가 섞인 신호.
 *
 * 실제로 섞이는 단위는 천원↔원(1,000배)과 원↔백만원(1,000,000배)이라 문턱을 1,000배로 둔다.
 * **100배로 낮추지 않는 것**은 초기 기업의 진짜 성장이 그 폭으로 일어나기 때문이다(매출
 * 1천만 → 10억). 경고가 사실보다 자주 울리면 곧 아무도 읽지 않는다.
 *
 * 0과 빈 칸은 건너뛴다 — 비율을 낼 수 없고, 0에서 시작한 해는 몇 배가 되든 단위 문제가 아니다.
 */
export function checkMagnitude<K extends string>(
  rows: YearRow[],
  yearField: string,
  fields: ReadonlyArray<{ key: string; label: string }>,
  warn: Warn<K>,
  card: K,
): void {
  const sorted = [...rows].sort((a, b) => (numberAt(a, yearField) ?? 0) - (numberAt(b, yearField) ?? 0))
  for (const f of fields) {
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = numberAt(sorted[i - 1], f.key)
      const curr = numberAt(sorted[i], f.key)
      if (prev === null || curr === null || prev === 0 || curr === 0) continue
      const ratio = Math.abs(curr) / Math.abs(prev)
      if (ratio >= 1000 || ratio <= 0.001) {
        const year = numberAt(sorted[i], yearField)
        warn(card, `${f.label}이(가) ${year}년에 천 배 넘게 달라졌습니다 — 표의 단위가 섞였는지 확인하세요`)
        // 한 칸에서 한 번만 말한다. 단위가 섞이면 모든 해가 걸려 경고가 표를 덮는다.
        break
      }
    }
  }
}

/**
 * 총계가 부분의 합과 맞는가 — 재무상태표의 `자산 = 부채 + 자본`이 그것이다.
 *
 * 어긋나면 셋 중 하나가 잘못 읽힌 것인데 **무엇인지는 알 수 없다.** 그래서 값을 그대로 두고
 * 해만 말한다. 반올림 잔차를 오류로 세지 않도록 여유를 받는다(단위가 대상마다 달라 호출자가 준다).
 */
export function checkIdentity<K extends string>(
  rows: YearRow[],
  yearField: string,
  total: string,
  parts: readonly string[],
  tolerance: number,
  warn: Warn<K>,
  card: K,
  message: string,
): void {
  for (const r of rows) {
    const t = numberAt(r, total)
    if (t === null) continue
    const values = parts.map((p) => numberAt(r, p))
    if (values.some((v) => v === null)) continue
    const sum = values.reduce((acc: number, v) => acc + (v as number), 0)
    if (Math.abs(t - sum) > tolerance) {
      warn(card, `${numberAt(r, yearField)}년 ${message} — 원문 확인 필요`)
    }
  }
}

/**
 * 한 줄 안에서 **작아야 할 값이 더 큰가** — 매출총이익이 매출보다 크거나, 영업이익이 매출보다 큰 경우.
 *
 * 정의상 일어날 수 없는 관계만 담는다. "드물지만 가능한" 관계를 넣으면 그 경고가 울리는 날이
 * 오고, 한 번이라도 틀린 경고는 나머지 경고까지 함께 무디게 한다.
 *
 * **음수는 보지 않는다** — 손실이 난 해에는 이익이 매출보다 작다는 것이 자명하고, 부호가 섞이면
 * 크기 비교가 뜻을 잃는다.
 */
export function checkOrder<K extends string>(
  rows: YearRow[],
  yearField: string,
  pairs: ReadonlyArray<{ larger: string; smaller: string; message: string }>,
  warn: Warn<K>,
  card: K,
): void {
  for (const p of pairs) {
    for (const r of rows) {
      const big = numberAt(r, p.larger)
      const small = numberAt(r, p.smaller)
      if (big === null || small === null || big <= 0 || small <= 0) continue
      if (small > big) {
        warn(card, `${numberAt(r, yearField)}년 ${p.message} — 원문 확인 필요`)
        // 한 짝에서 한 번만. 단위가 어긋난 표에서는 모든 해가 걸린다.
        break
      }
    }
  }
}
