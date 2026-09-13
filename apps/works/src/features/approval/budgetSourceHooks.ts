/**
 * 근거 품의 한 건에서 파생되는 것들 — 그 문서, 그 문서의 사용 현황, 고를 수 있는 예산 줄.
 *
 * 기안 화면과 상세 화면이 **같은 파생을 한다**. 한쪽에만 두면 고르는 자리와 읽는 자리가
 * 서로 다른 규칙으로 예산 줄을 세우게 되고, 그때 담당자는 자기가 고른 줄이 왜 다르게
 * 보이는지 답할 곳이 없다.
 */
import { useMemo } from 'react'
import { budgetLineOptions } from '@/features/approval/budget'
import { useBudgetSourceDetail, useBudgetStatus } from '@/features/approval/budgetApi'
import type { BudgetRefSource } from '@/features/approval/budgetRefContext'
import {
  budgetAmountColumn,
  budgetField,
  budgetValue,
  type FieldValues,
} from '@/features/approval/fields'

export function useBudgetSourceState(
  budgetDocumentId: string | null | undefined,
  /** 고를 것이 없을 때 그 이유. 화면마다 다음에 할 일이 다르다. */
  emptyHint: string,
) {
  const id = budgetDocumentId ?? null
  const { data: sourceDoc, isLoading: docLoading, isError: docError } = useBudgetSourceDetail(id)
  const {
    data: usage,
    isLoading: usageLoading,
    isError: usageError,
  } = useBudgetStatus(id)

  const refSource = useMemo<BudgetRefSource>(() => {
    const field = sourceDoc ? budgetField(sourceDoc.fields) : null
    const column = field ? budgetAmountColumn(field) : null
    return {
      // **맨 아래 줄만 선다** — 위층은 아래 줄들의 합이라 그 자리에서 돈을 쓸 수 없다.
      options:
        sourceDoc && field && column
          ? budgetLineOptions(
              budgetValue(sourceDoc.fieldValues as FieldValues, field.key),
              column.key,
            )
          : [],
      usage: usage ?? new Map(),
      // 근거 품의 자체를 못 읽으면 줄별 현황도 알 수 없다 — 둘을 한 사실로 합쳐 내려보낸다.
      usageLoading: docLoading || usageLoading,
      usageError: docError || usageError,
      emptyHint,
    }
  }, [sourceDoc, usage, docLoading, docError, usageLoading, usageError, emptyHint])

  return { sourceDoc, usage, usageLoading, usageError, refSource }
}
