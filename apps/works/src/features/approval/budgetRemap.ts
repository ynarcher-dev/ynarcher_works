/**
 * 예산표를 다른 양식의 열 구성으로 옮긴다 — 예산 변경 품의가 원 품의의 예산을 싣는 자리.
 *
 * 값을 그대로 베끼면 **금액 열 key가 다른 양식에서 예산이 통째로 비어 버린다**(줄 id는 남는데
 * 금액이 어느 칸에도 없다). 그래서 자리를 역할로 맞춘다: 합계액→합계액, 공급가액→공급가액,
 * 부가세→부가세, 과세 유형→과세 유형. 서버 `app.approval_budget_remap`이 같은 규칙으로
 * 되돌려 적용한다(변경 → 원 품의).
 *
 * **없는 칸은 만들지 않는다.** 합계액 하나뿐인 옛 문서를 부가세 양식으로 옮길 때 공급가액·
 * 부가세를 추정해 채우면 그 숫자가 그대로 신고 자료가 된다. 빈 칸으로 두고 사람이 적는다.
 */
import type { BudgetTreeValue } from '@/features/approval/budget'
import { amountColumns, type FormField } from '@/features/approval/fields'

export function remapBudgetColumns(
  value: BudgetTreeValue,
  from: FormField,
  to: FormField,
): BudgetTreeValue {
  const f = amountColumns(from)
  const t = amountColumns(to)
  const toKeys = new Set((to.columns ?? []).map((c) => c.key))
  const roleKeys = new Set(
    [f.gross?.key, f.net?.key, f.vat?.key, f.kind?.key].filter((k): k is string => Boolean(k)),
  )
  const pairs: [string | undefined, string | undefined][] = [
    [f.gross?.key, t.gross?.key],
    [f.net?.key, t.net?.key],
    [f.vat?.key, t.vat?.key],
    [f.kind?.key, t.kind?.key],
  ]

  return {
    levels: [...value.levels],
    // 줄 id·층·이름은 그대로다 — id가 바뀌면 이미 나간 지출이 가리킬 자리가 사라진다.
    rows: value.rows.map((row) => {
      const values: Record<string, string> = {}
      // 역할이 없는 칸(수량·단가·비고)은 key가 그대로 있는 경우에만 옮긴다.
      for (const [key, cell] of Object.entries(row.values)) {
        if (toKeys.has(key) && !roleKeys.has(key)) values[key] = cell
      }
      for (const [fromKey, toKey] of pairs) {
        if (!fromKey || !toKey) continue
        const cell = row.values[fromKey]
        if (cell !== undefined) values[toKey] = cell
      }
      return { ...row, values }
    }),
  }
}

/**
 * 대상 품의가 쓰는 공급가액·부가세 칸을 이 변경 양식이 **표현하지 못하는가.**
 *
 * 못 하는 채로 상신하면 적용 시점에 그 두 칸이 빈 예산표가 대상 품의에 앉는다 — 화면에서
 * 고칠 길이 없는 문서가 된다. 서버도 상신과 적용 두 자리에서 같은 판정으로 거절하므로,
 * 여기서는 **미리 말해 주기 위해서만** 쓴다(막는 것은 서버다).
 */
export function vatIncompatible(target: FormField, change: FormField): boolean {
  const t = amountColumns(target)
  const c = amountColumns(change)
  return Boolean((t.net && !c.net) || (t.vat && !c.vat))
}

/** 아직 아무것도 적지 않은 예산표인가 — 사람이 적어 둔 변경안을 덮지 않기 위한 판정. */
export function isBlankBudget(value: BudgetTreeValue): boolean {
  return value.rows.every(
    (row) =>
      !row.name.trim() &&
      !(row.path ?? []).some((part) => part.trim()) &&
      Object.values(row.values).every((cell) => !cell.trim()),
  )
}

/**
 * 마지막으로 실어 준 씨앗 이후로 사람이 손댄 표인가.
 *
 * 판정이 한 곳에 있어야 두 자리가 어긋나지 않는다 — 재조회는 **손댄 표를 덮지 않기 위해**,
 * 대상 변경은 **덮기 전에 한 번 묻기 위해** 같은 답을 쓴다.
 */
export function budgetSeedDirty(current: BudgetTreeValue, seededJson: string | null): boolean {
  if (isBlankBudget(current)) return false
  return JSON.stringify(current) !== seededJson
}
