/**
 * 예산·지출 연동 서버 훅.
 *
 * 사용 금액을 저장하지 않고 **매번 서버가 집계한다**(app.approval_budget_usage) — 적어 두면
 * 반려·보완 재상신·승인 취소 때마다 되돌려 빼야 하고, 한 번이라도 놓치면 남은 예산이 조용히
 * 거짓을 말한다. 그래서 화면도 캐시를 오래 들고 있지 않는다.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { BudgetUsage } from '@/features/approval/BudgetTreeView'
import { budgetField, parseFields, type FormField } from '@/features/approval/fields'
import type { ApprovalForm } from '@/features/approval/approvalApi'
import type { ApprovalStatus } from '@/features/management/config'

/** 근거 품의로 고를 수 있는 문서 한 건(선택 목록의 한 줄). */
export interface BudgetSourceDoc {
  id: string
  title: string
  docNo: string | null
  amount: number | null
  createdAt: string
  formName: string | null
}

/**
 * 예산표를 가진 양식들 — "이 양식이 품의서인가"는 budget_link가 아니라 **필드에 예산표가
 * 있는가**가 답한다(같은 사실을 두 곳에 적지 않는다. 서버 app.approval_budget_keys도 같다).
 *
 * **예산 변경 양식(REVISE)은 뺀다.** 변경 품의도 예산표를 갖지만 그 금액은 원 품의에 이미
 * 반영되어 있어, 근거로 고를 수 있게 두면 같은 돈을 두 번 쓴다(서버도 같은 줄에서 막는다).
 */
export function budgetFormIds(forms: ApprovalForm[]): string[] {
  return forms
    .filter(
      (f) =>
        f.budget_link !== 'REVISE' &&
        budgetField(parseFields(f.current_version?.fields)) !== null,
    )
    .map((f) => f.id)
}

/**
 * 근거 품의 후보 — **승인이 끝난 품의만** 고를 수 있다. 흐르는 중인 품의의 예산은 아직
 * 확정된 돈이 아니라, 그 위에 지출을 걸면 결재 도중 예산이 바뀌어 차감의 근거가 흔들린다.
 * 보이는 범위는 서버 RLS가 가른다(열람할 수 없는 품의는 애초에 돌아오지 않는다).
 */
export function useBudgetSourceDocuments(formIds: string[], keyword: string) {
  return useQuery({
    queryKey: ['approval', 'budget-sources', formIds, keyword],
    enabled: formIds.length > 0,
    queryFn: async (): Promise<BudgetSourceDoc[]> => {
      let q = supabase
        .from('approval_documents')
        .select('id, title, doc_no, amount, created_at, form:form_id(name)')
        .in('form_id', formIds)
        .eq('status', 'APPROVED')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50)
      const kw = keyword.trim().replace(/[(),]/g, ' ').trim()
      if (kw) q = q.or(`title.ilike.%${kw}%,doc_no.ilike.%${kw}%`)
      const { data, error } = await q
      if (error) throw error
      return ((data ?? []) as unknown as {
        id: string
        title: string
        doc_no: string | null
        amount: number | null
        created_at: string
        form: { name: string } | null
      }[]).map((r) => ({
        id: r.id,
        title: r.title,
        docNo: r.doc_no,
        amount: r.amount,
        createdAt: r.created_at,
        formName: r.form?.name ?? null,
      }))
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
        .select('id, title, doc_no, status, amount, field_values, version:form_version_id(fields)')
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
        field_values: Record<string, unknown>
        version: { fields: unknown } | null
      }
      return {
        id: row.id,
        title: row.title,
        docNo: row.doc_no,
        status: row.status,
        amount: row.amount,
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
