/**
 * 근거 품의 후보를 **어떻게 물을 것인가** — 조회 자체가 아니라 그 조회의 모양만 정한다.
 *
 * 서버로 나가는 줄과 갈라 두는 이유는 여기 담긴 것이 전부 눈으로 확인할 수 없는 계산이기
 * 때문이다. 몇 번째 행부터 몇 번째까지 받을 것인가, 검색어를 어느 칸에 걸 것인가, '보기'로
 * 고른 양식이 후보의 울타리를 넘지 않는가 — 셋 다 틀려도 화면은 멀쩡해 보이고 결과만 조용히
 * 어긋난다(51번째 품의가 목록에서 사라져 있던 것이 그랬다).
 */
import { approvalFormDisplayName } from '@/features/approval/model'

/** 한 페이지에 세우는 줄 수. 모달 본문이 스크롤 없이 받는 높이에 맞춘다. */
export const BUDGET_SOURCE_PAGE_SIZE = 20

/** '보기' 필터에서 전체를 뜻하는 값. */
export const BUDGET_SOURCE_ALL_FORMS = ''

/** 후보가 될 수 있는 양식 한 개(예산표를 가졌고 REVISE가 아닌 것). */
export interface BudgetSourceForm {
  id: string
  name: string
}

export interface BudgetSourcePlanInput {
  /** 후보의 울타리. 이 목록 밖의 양식은 어떤 경로로도 조회에 들어가지 않는다. */
  formIds: readonly string[]
  /** '보기'로 고른 양식. 울타리 밖 값이면 무시한다 — 필터는 좁히기만 하고 넓히지 않는다. */
  formFilterId: string
  /** 이미 정제된 검색어(괄호·콤마 제거). */
  keyword: string
  /** 검색어가 이름에 걸리는 양식 id(문서 종류로 찾기). */
  keywordFormIds: readonly string[]
  /** 검색어가 이름에 걸리는 사용자 id(기안자로 찾기). */
  drafterIds: readonly string[]
  /** 0-base. */
  page: number
  pageSize: number
}

export interface BudgetSourcePlan {
  /** `.in('form_id', …)`에 걸 값. */
  formIds: string[]
  /** `.range(from, to)`. */
  from: number
  to: number
  /** PostgREST `.or()` 원문. 검색어가 없으면 null. */
  orExpr: string | null
}

/**
 * 조회 한 번의 설계도.
 *
 * `.or()`는 `.in('form_id', …)`·`status`·`deleted_at` 조건과 **AND로 묶이므로** 검색어가
 * 후보 범위를 넓히지 못한다 — 승인 완료·미삭제·예산표 양식이라는 기존 정책은 검색어가
 * 무엇이든 그대로 남는다. 넓힐 수 있는 유일한 통로가 '보기' 필터라 그것만 울타리와 대조한다.
 */
export function budgetSourcePlan({
  formIds,
  formFilterId,
  keyword,
  keywordFormIds,
  drafterIds,
  page,
  pageSize,
}: BudgetSourcePlanInput): BudgetSourcePlan {
  const narrowed =
    formFilterId && formIds.includes(formFilterId) ? [formFilterId] : [...formIds]
  const from = Math.max(0, page) * pageSize
  const kw = keyword.trim()
  const or: string[] = []
  if (kw) {
    or.push(`title.ilike.%${kw}%`, `doc_no.ilike.%${kw}%`)
    // 종류·기안자는 이 표에 이름이 없고 참조만 있다. 이름 → id는 한 번에 풀어 오므로
    // 줄마다 묻는 일(N+1)이 생기지 않는다.
    if (keywordFormIds.length > 0) or.push(`form_id.in.(${keywordFormIds.join(',')})`)
    if (drafterIds.length > 0) or.push(`drafter_id.in.(${drafterIds.join(',')})`)
  }
  return {
    formIds: narrowed,
    from,
    to: from + pageSize - 1,
    orExpr: or.length > 0 ? or.join(',') : null,
  }
}

/** 검색어가 이름에 걸리는 양식 — 문서 종류로도 찾을 수 있게 한다. */
export function formIdsMatchingKeyword(
  forms: readonly BudgetSourceForm[],
  keyword: string,
): string[] {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return []
  return forms
    .filter((f) => approvalFormDisplayName(f.name).toLowerCase().includes(kw))
    .map((f) => f.id)
}

/**
 * '보기' 필터의 선택지 — 후보 양식이 둘 이상일 때만 선다.
 *
 * 하나뿐이면 고를 것이 없다. 한 칸짜리 드롭다운은 좁힐 수 없는 축을 좁힐 수 있는 것처럼
 * 보이게 할 뿐이라, 그 자리는 아예 비운다.
 */
export function budgetSourceViewOptions(
  forms: readonly BudgetSourceForm[],
): { value: string; label: string }[] | null {
  if (forms.length < 2) return null
  return [
    { value: BUDGET_SOURCE_ALL_FORMS, label: '전체 종류' },
    ...forms.map((f) => ({ value: f.id, label: approvalFormDisplayName(f.name) })),
  ]
}
