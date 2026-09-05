// [AI 작성하기] 동시에 몇 개까지 — 묶음 요청을 병렬로 돌리되 상한을 둔다.
//
// `Promise.all`을 그대로 쓰지 않는 이유는 둘이다.
//   * **하나의 실패가 나머지를 버린다.** 주주 카드가 거절됐다고 이미 성공한 여덟 카드까지
//     못 쓰게 되면 담당자는 같은 자료로 처음부터 다시 눌러야 한다.
//   * **동시 요청 수를 셀 수 없다.** 조합이 여섯이면 여섯이 한꺼번에 나가 요율 제한(429)에
//     걸린다. 걸린 요청은 재시도하지만, 재시도까지 같은 순간에 몰리면 또 부딪힌다.
//
// 그래서 `allSettled`의 성질(전부 끝날 때까지 기다리고 실패도 값으로 돌려준다)에 **작업자
// 수 상한**을 더한다. 결과는 넣은 순서 그대로 돌아온다 — 어느 묶음의 답인지 index로 맞춰야
// 하기 때문이다.
//
// Deno API를 쓰지 않는다(works vitest가 이 판정을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8.3

/**
 * 항목을 최대 `limit`개씩 동시에 처리한다.
 *
 * 던져진 예외는 잡아서 `rejected`로 돌려준다 — 한 묶음의 예외가 나머지 묶음의 결과까지
 * 버리지 않아야 하고, 호출자는 그 사유를 사람이 읽을 문구로 바꿔야 한다.
 */
export async function runPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length)
  let cursor = 0

  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor
      cursor += 1
      if (i >= items.length) return
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i], i) }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  }

  const workers = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}
