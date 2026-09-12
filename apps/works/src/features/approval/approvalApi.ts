import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ApprovalStatus } from '@/features/management/config'
import type { ApprovalLineKind } from '@/features/approval/config'
import type { FieldValues } from '@/features/approval/fields'
import type { ApprovalListRow } from '@/features/approval/model'

/** 문서함 목록 select — model.ApprovalListRow와 형태가 일치해야 한다. */
const LIST_SELECT =
  'id, title, doc_no, form_type, status, drafter_id, department_id, amount, created_at, completed_at, ' +
  'form:form_id(name), ' +
  'legacy:approval_legacy_documents(source_system), ' +
  // 자리 id는 목록에서 일괄 승인을 걸기 위해 함께 받는다(서버가 받는 것은 문서가 아니라 자리다).
  'approval_lines(id, approver_id, step_order, decision, kind, round), ' +
  'approval_recipients(user_id), ' +
  'approval_reads(user_id)'

/**
 * 문서함 목록 — 보이는 범위는 서버 RLS(기안자·결재자·참조자·같은 부서·management)가
 * 가르고, 문서함·진행 분류는 model의 순수 함수가 클라이언트에서 가른다.
 * 결재선·참조자·열람 확인을 임베드로 함께 받아 목록 한 번으로 분류까지 끝낸다.
 */
export function useApprovalDocuments() {
  return useQuery({
    queryKey: ['approval', 'documents'],
    queryFn: async (): Promise<ApprovalListRow[]> => {
      const { data, error } = await supabase
        .from('approval_documents')
        .select(LIST_SELECT)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as ApprovalListRow[]
    },
  })
}

export interface ApprovalForm {
  id: string
  name: string
  /** 대분류. 기안 화면에서 분류를 고른 뒤 그 안의 양식을 고른다. */
  category: string
  abbrev: string
  retention: string
  security_grade: string
  is_active: boolean
  sort_order: number
  current_version_id: string | null
  /** 현재 버전의 필드 스키마(원본 jsonb — parseFields로 읽는다). */
  current_version: { id: string; version_no: number; fields: unknown } | null
  /**
   * 이 양식이 예산과 맺는 관계. NONE / SPEND_REQUIRED(근거 품의 필수) /
   * SPEND_OPTIONAL(선택) / REVISE(예산 변경 품의).
   * 예산표를 가졌는지는 이 값이 아니라 필드에 BUDGET_TREE가 있는지가 답한다.
   */
  budget_link: BudgetLink
}

export type BudgetLink = 'NONE' | 'SPEND_REQUIRED' | 'SPEND_OPTIONAL' | 'REVISE'

/** 근거 품의를 고르는 자리가 서는가. */
export function usesBudgetSource(link: BudgetLink | undefined): boolean {
  return link === 'SPEND_REQUIRED' || link === 'SPEND_OPTIONAL' || link === 'REVISE'
}

const FORM_SELECT =
  'id, name, category, abbrev, retention, security_grade, is_active, sort_order, current_version_id, ' +
  'budget_link, ' +
  'current_version:current_version_id(id, version_no, fields)'

/** 결재 양식 목록 + 현재 버전 스키마. 기안 화면과 ADMIN 빌더가 함께 쓴다. */
export function useApprovalForms() {
  return useQuery({
    queryKey: ['approval', 'forms'],
    queryFn: async (): Promise<ApprovalForm[]> => {
      const { data, error } = await supabase
        .from('approval_forms')
        .select(FORM_SELECT)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('category', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as ApprovalForm[]
    },
  })
}

/**
 * 분류 → 그 분류의 양식들. 선택지를 **살아 있는 양식에서 파생**한다 —
 * 별도 분류 원장을 두면 아무 양식도 딸리지 않은 빈 분류가 목록에 남는다.
 * 분류의 순서도 그 안에서 가장 앞선 양식의 표시 순서를 따른다.
 */
export function groupFormsByCategory(forms: ApprovalForm[]): {
  category: string
  forms: ApprovalForm[]
}[] {
  const map = new Map<string, ApprovalForm[]>()
  for (const f of forms) {
    const key = f.category || '공통'
    const list = map.get(key) ?? []
    list.push(f)
    map.set(key, list)
  }
  return [...map.entries()]
    .map(([category, list]) => ({
      category,
      forms: [...list].sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      ),
    }))
    .sort((a, b) => {
      const oa = Math.min(...a.forms.map((f) => f.sort_order))
      const ob = Math.min(...b.forms.map((f) => f.sort_order))
      return oa !== ob ? oa - ob : a.category.localeCompare(b.category)
    })
}

export interface ApprovalDetail {
  id: string
  title: string
  doc_no: string | null
  form_id: string | null
  form_version_id: string | null
  form_type: string
  field_values: FieldValues
  body: string | null
  status: ApprovalStatus
  amount: number | null
  drafter_id: string | null
  department_id: string | null
  created_at: string
  completed_at: string | null
  /** 근거 품의(지출결의) 또는 변경 대상 품의(예산 변경 품의). */
  budget_document_id: string | null
  legacy: {
    source_system: string
    source_form_title: string | null
    original_drafter_name: string
    original_drafter_position: string | null
    original_department_name: string | null
    source_was_deleted: boolean
    source_deleted_at: string | null
    participants: LegacyApprovalParticipant[]
  } | null
  form: {
    name: string
    category: string
    retention: string
    security_grade: string
    budget_link: BudgetLink
  } | null
  version: { fields: unknown } | null
  approval_lines: {
    id: string
    approver_id: string | null
    step_order: number
    decision: 'PENDING' | 'REVISION_REQUESTED' | 'APPROVED' | 'REJECTED'
    kind: ApprovalLineKind
    /** 결재 회차. 보완 재상신이 남은 구간만 다음 회차로 복제한다. */
    round: number
    comment: string | null
    decided_at: string | null
    /** 2026-09-10 이전 되돌림 이력. 새 반려·보완 흐름에서는 쓰지 않는다. */
    return_to_step: number | null
    return_via_drafter: boolean | null
    return_reset_agreement: boolean | null
  }[]
  approval_recipients: { user_id: string; sort_order: number }[]
  approval_reads: { user_id: string; read_at: string }[]
}

const DETAIL_SELECT =
  'id, title, doc_no, form_id, form_version_id, form_type, field_values, body, status, amount, ' +
  'drafter_id, department_id, created_at, completed_at, budget_document_id, ' +
  'legacy:approval_legacy_documents(source_system, source_form_title, original_drafter_name, original_drafter_position, original_department_name, source_was_deleted, source_deleted_at, participants:approval_legacy_participants(id, source_line_section, step_order, source_role, normalized_role, source_decision, normalized_decision, decided_at, original_name, original_position, actor:approval_legacy_actors(original_position))), ' +
  'form:form_id(name, category, retention, security_grade, budget_link), ' +
  'version:form_version_id(fields), ' +
  'approval_lines(id, approver_id, step_order, decision, kind, round, comment, decided_at, return_to_step, return_via_drafter, return_reset_agreement), ' +
  'approval_recipients(user_id, sort_order), ' +
  'approval_reads(user_id, read_at)'

export interface LegacyApprovalParticipant {
  id: string
  source_line_section: string | null
  step_order: number | null
  source_role: string | null
  normalized_role:
    | 'DRAFTER'
    | 'APPROVER'
    | 'AGREEMENT'
    | 'FINANCE_AGREEMENT'
    | 'CC'
    | 'CONFIRMER'
    | 'OTHER'
    | null
  source_decision: string | null
  normalized_decision: 'APPROVED' | 'REJECTED' | 'CONFIRMED' | 'PENDING' | null
  decided_at: string | null
  original_name: string
  original_position: string | null
  actor: { original_position: string | null } | null
}

/** 문서 단건. 열람 가능 여부는 RLS가 가르며, 못 보는 문서는 null로 돌아온다. */
export function useApprovalDocument(id: string | undefined) {
  return useQuery({
    queryKey: ['approval', 'document', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<ApprovalDetail | null> => {
      const { data, error } = await supabase
        .from('approval_documents')
        .select(DETAIL_SELECT)
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as unknown as ApprovalDetail | null
    },
  })
}

export interface AggregateSourceRow {
  id: string
  title: string
  doc_no: string | null
  status: ApprovalStatus
  amount: number | null
  department_id: string | null
  created_at: string
  field_values: FieldValues
  version: { fields: unknown } | null
}

/**
 * 집계용 문서 조회 — 한 양식의 문서만, 값(field_values)과 그 해석 기준(버전 스키마)을 함께.
 * 목록 훅과 분리한 이유는 필요한 컬럼이 다르기 때문이다(문서함은 결재선·열람 확인이,
 * 집계는 값과 스키마가 필요하다). 보이는 범위는 어느 쪽이든 서버 RLS가 가른다.
 */
export function useApprovalAggregateSource(formId: string | undefined) {
  return useQuery({
    queryKey: ['approval', 'aggregate', formId],
    enabled: Boolean(formId),
    queryFn: async (): Promise<AggregateSourceRow[]> => {
      const { data, error } = await supabase
        .from('approval_documents')
        .select(
          'id, title, doc_no, status, amount, department_id, created_at, field_values, version:form_version_id(fields)',
        )
        .eq('form_id', formId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as AggregateSourceRow[]
    },
  })
}

/** 구분별 결재선 지정(결재는 배열 순서가 곧 순번, 합의·재무합의는 순서 없음). */
export interface ApprovalLineInput {
  APPROVAL: string[]
  AGREEMENT: string[]
  FINANCE_AGREEMENT: string[]
}

export const EMPTY_LINES: ApprovalLineInput = {
  APPROVAL: [],
  AGREEMENT: [],
  FINANCE_AGREEMENT: [],
}

export interface CreateApprovalInput {
  title: string
  formId: string
  formVersionId: string
  fieldValues: FieldValues
  departmentId: string | null
  lines: ApprovalLineInput
  recipientIds: string[]
  /** 근거 품의(지출결의) 또는 변경 대상 품의(예산 변경 품의). 없으면 null. */
  budgetDocumentId?: string | null
  /** 임시저장이면 DRAFT — 문서 번호는 상신할 때 붙는다. */
  asDraft?: boolean
}

/**
 * 기안 상신. 문서 번호·대표 금액·완료 일시는 DB 트리거가 채우므로 여기서 계산해 보내지 않는다
 * (화면이 계산해 보내면 화면마다 값이 갈린다). 결재선·참조자는 문서를 만든 뒤 잇는다.
 */
export function useCreateApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: CreateApprovalInput): Promise<string> => {
      const { data: doc, error } = await supabase
        .from('approval_documents')
        .insert({
          title: v.title,
          form_id: v.formId,
          form_version_id: v.formVersionId,
          field_values: v.fieldValues,
          department_id: v.departmentId,
          budget_document_id: v.budgetDocumentId ?? null,
          status: v.asDraft ? 'DRAFT' : 'PENDING',
        })
        .select('id')
        .single()
      if (error) throw error

      // 결재는 배열 순서가 곧 순번이고, 합의·재무합의는 병렬이라 순번이 판정에 쓰이지 않는다
      // (그래도 표에 놓이는 순서를 위해 지정 순서를 그대로 적어 둔다).
      const lineRows = (Object.keys(v.lines) as (keyof ApprovalLineInput)[]).flatMap((kind) =>
        v.lines[kind].map((approver_id, i) => ({
          document_id: doc.id,
          approver_id,
          step_order: i + 1,
          kind,
        })),
      )
      if (lineRows.length > 0) {
        const { error: le } = await supabase.from('approval_lines').insert(lineRows)
        if (le) throw le
      }
      if (v.recipientIds.length > 0) {
        const { error: re } = await supabase.from('approval_recipients').insert(
          v.recipientIds.map((user_id, i) => ({
            document_id: doc.id,
            user_id,
            sort_order: i,
          })),
        )
        if (re) throw re
      }
      return doc.id as string
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approval', 'documents'] })
    },
  })
}


/**
 * 결재 처리(승인·반려·보완 요청) — `decide_approval_document` RPC 한 경로.
 *
 * **종전에는 화면이 결재선과 문서를 각각 UPDATE했다.** 그런데 문서 UPDATE 정책은
 * `management 쓰기 또는 기안자 본인`이라, management 권한이 없는 결재자가 남의 문서를
 * 승인하면 상태 UPDATE가 0행에 걸려 조용히 무시됐다(PostgREST는 0행 UPDATE를 오류로
 * 내지 않는다) — 도장은 찍혔는데 문서는 PENDING에 머무는 어긋남이다. 보완 요청도 여기에
 * 회차 복제까지 더해 **한 트랜잭션 안에서** 끝나야 하므로(중간에 끊기면 문서가 아무의
 * 차례도 아닌 상태로 굳는다) 처리 경로를 서버 함수 하나로 모았다.
 *
 * 차례·회차·상태의 유효성은 전부 서버가 다시 판정한다 — 화면이 컨트롤을 숨기는
 * 것은 보안이 아니다.
 */
export function useDecideApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      lineId: string
      documentId: string
      decision: 'APPROVED' | 'REVISION_REQUESTED' | 'REJECTED'
      comment?: string
    }) => {
      const { error } = await supabase.rpc('decide_approval_document', {
        p_line_id: v.lineId,
        p_decision: v.decision,
        p_comment: v.comment?.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: (_data, v) => {
      void qc.invalidateQueries({ queryKey: ['approval', 'documents'] })
      void qc.invalidateQueries({
        queryKey: ['approval', 'document', v.documentId],
      })
    },
  })
}

/**
 * 일괄 승인 — 고른 자리마다 `decide_approval_document`를 한 번씩 부른다.
 *
 * **서버 함수 하나로 묶지 않는다.** 묶으면 한 건의 실패가 나머지를 통째로 되돌린다 —
 * 고른 열 건 중 하나가 방금 남의 보완으로 멈췄다고 나머지 아홉 건의 승인을 무를 이유가
 * 없고, 그 되돌림은 담당자가 다시 고를 수도 없는 실패다(무엇이 걸렸는지 화면이 모른다).
 * 대신 건별 성패를 세어 돌려주고 부르는 쪽이 그 사실을 밝힌다.
 *
 * 차례·회차·자격은 건마다 서버가 다시 판정한다 — 화면이 고를 수 있게 둔 것은 보안이 아니다.
 */
export function useBulkApproveApprovals() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (lineIds: string[]): Promise<{ done: number; failed: number }> => {
      let done = 0
      let failed = 0
      for (const lineId of lineIds) {
        const { error } = await supabase.rpc('decide_approval_document', {
          p_line_id: lineId,
          p_decision: 'APPROVED',
          p_comment: null,
        })
        if (error) failed += 1
        else done += 1
      }
      return { done, failed }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approval', 'documents'] })
      void qc.invalidateQueries({ queryKey: ['approval', 'document'] })
    },
  })
}

/**
 * 이미 찍은 본인 승인을 회수한다. 서버가 현재 회차의 남은 줄과 문서 완료 여부를 다시 확인해
 * 진행 중이면 WITHDRAWN, 최종 승인 완료 뒤면 RESET을 반환한다.
 */
export function useRecallApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      lineId: string
      documentId: string
      reason?: string
    }): Promise<'WITHDRAWN' | 'RESET'> => {
      const { data, error } = await supabase.rpc('recall_approval_decision', {
        p_line_id: v.lineId,
        p_reason: v.reason?.trim() || null,
      })
      if (error) throw error
      return data as 'WITHDRAWN' | 'RESET'
    },
    onSuccess: (_data, v) => {
      void qc.invalidateQueries({ queryKey: ['approval', 'documents'] })
      void qc.invalidateQueries({ queryKey: ['approval', 'document', v.documentId] })
    },
  })
}


/**
 * 참조 확인 스탬프 — 본인이 직접 누른 것만 남긴다(상세의 이름 옆 체크, 목록의 일괄 확인).
 * RLS도 본인 행만 허용한다.
 *
 * 여러 건을 받는 이유는 목록의 일괄 확인이 같은 도장이기 때문이다 — 훅을 둘로 두면 같은
 * 규칙(무엇을 쓰고 어느 캐시를 버리는가)이 두 곳에 살게 된다. 승인과 달리 한 번의 upsert로
 * 끝나는 것은 여기에 서버가 다시 판정할 차례·회차가 없어서다.
 */
export function useMarkApprovalRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { documentIds: string[]; userId: string }) => {
      if (!v.documentIds.length) return
      const readAt = new Date().toISOString()
      const { error } = await supabase.from('approval_reads').upsert(
        v.documentIds.map((id) => ({
          document_id: id,
          user_id: v.userId,
          read_at: readAt,
        })),
        { onConflict: 'document_id,user_id' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approval', 'documents'] })
      void qc.invalidateQueries({ queryKey: ['approval', 'document'] })
    },
  })
}
