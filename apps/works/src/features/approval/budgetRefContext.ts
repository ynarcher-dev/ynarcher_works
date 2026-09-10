/**
 * 지출 내역 표의 '예산 줄' 칸이 무엇을 고를 수 있는지 — 근거 품의가 정한다.
 *
 * 선택지를 표 칸이 스스로 조회하지 않고 위에서 내려주는 이유는 **근거 품의가 문서 단위의
 * 값**이기 때문이다. 칸마다 조회하면 한 문서에서 같은 질의가 행 수만큼 돌고, 근거 품의를
 * 바꿨을 때 어떤 칸은 옛 목록을 들고 있는 순간이 생긴다.
 */
import { createContext, useContext } from 'react'
import type { BudgetLineOption } from '@/features/approval/budget'
import type { BudgetUsage } from '@/features/approval/BudgetTreeView'

export interface BudgetRefSource {
  options: BudgetLineOption[]
  /** 줄별 사용 현황 — 고르는 자리에서 "얼마 남았나"가 함께 보여야 한다. */
  usage: Map<string, BudgetUsage>
  /** 고를 것이 없을 때 그 이유. 빈 목록만 보여 주면 담당자가 다음에 할 일을 모른다. */
  emptyHint: string
}

const EMPTY: BudgetRefSource = {
  options: [],
  usage: new Map(),
  emptyHint: '근거 품의를 먼저 고르세요.',
}

export const BudgetRefContext = createContext<BudgetRefSource>(EMPTY)

export function useBudgetRefSource(): BudgetRefSource {
  return useContext(BudgetRefContext)
}
