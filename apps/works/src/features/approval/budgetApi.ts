/**
 * 예산·지출 연동 서버 훅.
 *
 * 사용 금액을 저장하지 않고 **매번 서버가 집계한다**(app.approval_budget_usage) — 적어 두면
 * 반려·보완 재상신·승인 취소 때마다 되돌려 빼야 하고, 한 번이라도 놓치면 남은 예산이 조용히
 * 거짓을 말한다. 그래서 화면도 캐시를 오래 들고 있지 않는다.
 */
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { sanitizeOrValue, userIdsByName } from '@/features/master/ledgerPage'
import {
  budgetSourcePlan,
  formIdsMatchingKeyword,
  type BudgetSourceForm,
} from '@/features/approval/budgetSourceQuery'
import type { BudgetUsage } from '@/features/approval/BudgetTreeView'
import { budgetField, parseFields, type FormField } from '@/features/approval/fields'
import type { ApprovalForm } from '@/features/approval/approvalApi'
import type { ApprovalStatus } from '@/features/management/config'

/**
 * 근거 품의로 고를 수 있는 문서 한 건(선택 목록의 한 줄).
 *
 * **금액을 담지 않는다.** 고르는 자리에서 품의 금액·사용 가능액을 보이면 담당자는 남은 돈이
 * 많은 품의를 고르게 되는데, 이 창이 묻는 것은 "이 지출이 **어느 품의의 일**인가"다. 금액은
 * 고른 뒤 예산표가 답한다.
 */
export interface BudgetSourceDoc {
  id: string
  title: string
  docNo: string | null
  /** 기안자 id. 이름은 이 표에 없으므로 화면이 임직원 원장에서 한 번에 풀어 붙인다. */
  drafterId: string | null
  createdAt: string
  formName: string | null
}

/** 후보 한 페이지. */
export interface BudgetSourcePage {
  rows: BudgetSourceDoc[]
  /** 검색·필터 반영 건수(`count: 'exact'`) — 페이지 수와 전체 건수 표기의 기준. */
  total: number
}

/**
 * 예산표를 가진 양식들 — "이 양식이 품의서인가"는 budget_link가 아니라 **필드에 예산표가
 * 있는가**가 답한다(같은 사실을 두 곳에 적지 않는다. 서버 app.approval_budget_keys도 같다).
 *
 * **예산 변경 양식(REVISE)은 뺀다.** 변경 품의도 예산표를 갖지만 그 금액은 원 품의에 이미
 * 반영되어 있어, 근거로 고를 수 있게 두면 같은 돈을 두 번 쓴다(서버도 같은 줄에서 막는다).
 *
 * id만이 아니라 이름을 함께 돌려주는 이유는 고르는 창이 문서 종류를 **보여주고 그것으로
 * 걸러내기** 때문이다. 이름을 따로 받아 오면 후보의 울타리와 그 이름표가 두 벌이 된다.
 */
export function budgetSourceForms(forms: ApprovalForm[]): BudgetSourceForm[] {
  return forms
    .filter(
      (f) =>
        f.budget_link !== 'REVISE' &&
        budgetField(parseFields(f.current_version?.fields)) !== null,
    )
    .map((f) => ({ id: f.id, name: f.name }))
}

/** 후보 목록 조회 한 번의 조건(창이 들고 있는 상태 그대로). */
export interface BudgetSourceQuery {
  forms: BudgetSourceForm[]
  keyword: string
  /** '보기'로 고른 양식. 빈 문자열이면 전체. */
  formFilterId: string
  /** 0-base. */
  page: number
  pageSize: number
}

/**
 * 근거 품의 후보 — **승인이 끝난 품의만** 고를 수 있다. 흐르는 중인 품의의 예산은 아직
 * 확정된 돈이 아니라, 그 위에 지출을 걸면 결재 도중 예산이 바뀌어 차감의 근거가 흔들린다.
 * 보이는 범위는 서버 RLS가 가른다(열람할 수 없는 품의는 애초에 돌아오지 않는다).
 *
 * **한 페이지만 받아 온다.** 종전에는 앞에서 50건을 끊어 왔고, 그 뒤의 품의는 검색어로도
 * 닿지 않는 한 존재하지 않는 것과 같았다 — 목록은 조용히 맞아 보이고 고를 수 없는 문서만
 * 늘어난다. 전체 건수는 `count: 'exact'`로 함께 세어 페이저가 몇 장인지 답하게 한다.
 */
export function useBudgetSourceDocuments(params: BudgetSourceQuery, enabled = true) {
  const { forms, keyword, formFilterId, page, pageSize } = params
  const formIds = forms.map((f) => f.id)
  return useQuery({
    queryKey: ['approval', 'budget-sources', formIds, keyword, formFilterId, page, pageSize],
    enabled: enabled && formIds.length > 0,
    // 페이지를 넘기는 동안 직전 페이지를 세워 둔다 — 넘길 때마다 표가 통째로 비면 다음
    // 버튼이 눌린 자리에서 사라진다.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<BudgetSourcePage> => {
      const kw = sanitizeOrValue(keyword)
      // 종류·기안자는 이 표에 이름이 없고 참조만 있다. 이름 → id는 검색어당 한 번만 풀어
      // 오므로 줄마다 묻는 일(N+1)이 생기지 않는다.
      const drafterIds = kw ? await userIdsByName(kw) : []
      const plan = budgetSourcePlan({
        formIds,
        formFilterId,
        keyword: kw,
        keywordFormIds: formIdsMatchingKeyword(forms, kw),
        drafterIds,
        page,
        pageSize,
      })
      let q = supabase
        .from('approval_documents')
        .select('id, title, doc_no, created_at, drafter_id, form:form_id(name)', {
          count: 'exact',
        })
        .in('form_id', plan.formIds)
        .eq('status', 'APPROVED')
        .is('deleted_at', null)
      // `.or()`는 위 조건들과 AND로 묶인다 — 검색어가 후보 범위를 넓히지 못한다.
      // 정렬·구간은 필터를 다 건 뒤에 붙인다(빌더가 그 뒤로는 필터를 받지 않는다).
      if (plan.orExpr) q = q.or(plan.orExpr)
      const { data, error, count } = await q
        .order('created_at', { ascending: false })
        .range(plan.from, plan.to)
      if (error) throw error
      const rows = ((data ?? []) as unknown as {
        id: string
        title: string
        doc_no: string | null
        created_at: string
        drafter_id: string | null
        form: { name: string } | null
      }[]).map((r) => ({
        id: r.id,
        title: r.title,
        docNo: r.doc_no,
        drafterId: r.drafter_id,
        createdAt: r.created_at,
        formName: r.form?.name ?? null,
      }))
      return { rows, total: count ?? 0 }
    },
  })
}

/** 근거 품의 한 건의 표시용 정보(고른 뒤 그 문서를 다시 읽어 예산표를 편다). */
export interface BudgetSourceDetail {
  id: string
  title: string
  docNo: string | null
  status: ApprovalStatus
  amount: number | null
  /** 기안자 id. 이름은 이 표에 없으므로 화면이 임직원 원장에서 푼다(고르는 창과 같은 규칙). */
  drafterId: string | null
  /** 양식 이름(문서 종류). 표시명 변환은 화면이 한다. */
  formName: string | null
  fields: FormField[]
  fieldValues: Record<string, unknown>
}

export function useBudgetSourceDetail(documentId: string | null | undefined) {
  return useQuery({
    queryKey: ['approval', 'budget-source', documentId],
    enabled: Boolean(documentId),
    queryFn: async (): Promise<BudgetSourceDetail | null> => {
      const { data, error } = await supabase
        .from('approval_documents')
        .select(
          'id, title, doc_no, status, amount, drafter_id, field_values, ' +
            'form:form_id(name), version:form_version_id(fields)',
        )
        .eq('id', documentId)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as unknown as {
        id: string
        title: string
        doc_no: string | null
        status: ApprovalStatus
        amount: number | null
        drafter_id: string | null
        field_values: Record<string, unknown>
        form: { name: string } | null
        version: { fields: unknown } | null
      }
      return {
        id: row.id,
        title: row.title,
        docNo: row.doc_no,
        status: row.status,
        amount: row.amount,
        drafterId: row.drafter_id,
        formName: row.form?.name ?? null,
        fields: parseFields(row.version?.fields),
        fieldValues: row.field_values ?? {},
      }
    },
  })
}

/**
 * 예산 줄별 사용 현황. 그 품의를 읽을 수 있는 사람만 통과한다(서버가 다시 판정한다).
 *
 * 승인된 지출만 '사용'이고 흐르는 중인 것은 '결재 중'으로 따로 온다 — 둘을 뭉치면 반려된
 * 지출이 예산을 계속 먹고, 갈라 두지 않으면 담당자가 "지금 올려도 되는가"에 답할 수 없다.
 */
export function useBudgetStatus(documentId: string | null | undefined) {
  return useQuery({
    queryKey: ['approval', 'budget-status', documentId],
    enabled: Boolean(documentId),
    // 지출이 승인될 때마다 값이 바뀌므로 오래 들고 있지 않는다.
    staleTime: 0,
    queryFn: async (): Promise<Map<string, BudgetUsage>> => {
      const { data, error } = await supabase.rpc('approval_budget_status', {
        p_document_id: documentId,
      })
      if (error) throw error
      const map = new Map<string, BudgetUsage>()
      for (const r of (data ?? []) as { line_id: string; spent: number; pending: number }[]) {
        map.set(r.line_id, { spent: Number(r.spent ?? 0), pending: Number(r.pending ?? 0) })
      }
      return map
    },
  })
}

/** 예산 변경 이력 한 줄. */
export interface BudgetRevision {
  id: string
  seq: number
  beforeTotal: number | null
  afterTotal: number | null
  appliedAt: string
  appliedBy: string | null
  changeDocumentId: string
  changeTitle: string | null
  changeDocNo: string | null
}

/** 품의에 적용된 예산 변경 이력(오래된 순). */
export function useBudgetRevisions(documentId: string | null | undefined) {
  return useQuery({
    queryKey: ['approval', 'budget-revisions', documentId],
    enabled: Boolean(documentId),
    queryFn: async (): Promise<BudgetRevision[]> => {
      const { data, error } = await supabase
        .from('approval_budget_revisions')
        .select(
          'id, seq, before_total, after_total, applied_at, applied_by, change_document_id, ' +
            'change:change_document_id(title, doc_no)',
        )
        .eq('target_document_id', documentId)
        .order('seq', { ascending: true })
      if (error) throw error
      return ((data ?? []) as unknown as {
        id: string
        seq: number
        before_total: number | null
        after_total: number | null
        applied_at: string
        applied_by: string | null
        change_document_id: string
        change: { title: string; doc_no: string | null } | null
      }[]).map((r) => ({
        id: r.id,
        seq: r.seq,
        beforeTotal: r.before_total === null ? null : Number(r.before_total),
        afterTotal: r.after_total === null ? null : Number(r.after_total),
        appliedAt: r.applied_at,
        appliedBy: r.applied_by,
        changeDocumentId: r.change_document_id,
        // 신청서를 열람할 수 없으면 제목이 비어 온다 — 그때도 "언제 얼마가 바뀌었나"는 남는다.
        changeTitle: r.change?.title ?? null,
        changeDocNo: r.change?.doc_no ?? null,
      }))
    },
  })
}

/**
 * 저장·결재 뒤 예산 관련 조회를 함께 새로 읽는다(지출 하나가 여러 화면의 숫자를 바꾼다).
 *
 * 문서 id를 알면 그 품의만, 모르면 예산 조회 전부를 새로 읽는다. 모를 때 아무것도 하지
 * 않으면 지출결의를 승인한 화면에서 품의 잔액이 옛 숫자로 남는다 — 어느 품의의 줄을
 * 가리켰는지는 그 지출 문서를 열어야 알 수 있는데, 승인하는 사람은 그것까지 들고 있지 않다.
 * 워크스페이스 예산 탭도 같은 사실을 보므로 함께 털어 낸다.
 */
export function useInvalidateBudget() {
  const qc = useQueryClient()
  return (documentId?: string | null) => {
    const scope = (key: string) =>
      documentId ? ['approval', key, documentId] : ['approval', key]
    void qc.invalidateQueries({ queryKey: scope('budget-status') })
    void qc.invalidateQueries({ queryKey: scope('budget-revisions') })
    void qc.invalidateQueries({ queryKey: ['approval', 'workspace-budget'] })
    void qc.invalidateQueries({ queryKey: ['approval', 'related'] })
  }
}

export type { BudgetUsage }
