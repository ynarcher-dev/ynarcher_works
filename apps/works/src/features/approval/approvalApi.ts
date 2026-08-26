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
  'approval_lines(approver_id, step_order, decision, kind), ' +
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
}

const FORM_SELECT =
  'id, name, category, abbrev, retention, security_grade, is_active, sort_order, current_version_id, ' +
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
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true })
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
    .map(([category, list]) => ({ category, forms: list }))
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
  form: { name: string; category: string; retention: string; security_grade: string } | null
  version: { fields: unknown } | null
  approval_lines: {
    id: string
    approver_id: string | null
    step_order: number
    decision: 'PENDING' | 'APPROVED' | 'REJECTED'
    kind: ApprovalLineKind
    comment: string | null
    decided_at: string | null
  }[]
  approval_recipients: { user_id: string; sort_order: number }[]
  approval_reads: { user_id: string; read_at: string }[]
}

const DETAIL_SELECT =
  'id, title, doc_no, form_id, form_version_id, form_type, field_values, body, status, amount, ' +
  'drafter_id, department_id, created_at, completed_at, ' +
  'form:form_id(name, category, retention, security_grade), ' +
  'version:form_version_id(fields), ' +
  'approval_lines(id, approver_id, step_order, decision, kind, comment, decided_at), ' +
  'approval_recipients(user_id, sort_order), ' +
  'approval_reads(user_id, read_at)'

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
 * 결재 처리(승인/반려). 내 결재선 행을 찍고 문서 상태를 옮긴다.
 * 반려는 즉시 종결, 승인은 남은 단계가 있으면 진행(IN_REVIEW), 없으면 최종 승인이다.
 * 본인 결재선 행만 갱신 가능함은 RLS가 강제한다.
 */
export function useDecideApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      lineId: string
      documentId: string
      decision: 'APPROVED' | 'REJECTED'
      isFinal: boolean
      comment?: string
    }) => {
      const { error } = await supabase
        .from('approval_lines')
        .update({
          decision: v.decision,
          decided_at: new Date().toISOString(),
          comment: v.comment?.trim() || null,
        })
        .eq('id', v.lineId)
      if (error) throw error

      const nextStatus: ApprovalStatus =
        v.decision === 'REJECTED' ? 'REJECTED' : v.isFinal ? 'APPROVED' : 'IN_REVIEW'
      const { error: de } = await supabase
        .from('approval_documents')
        .update({ status: nextStatus })
        .eq('id', v.documentId)
      if (de) throw de
    },
    onSuccess: (_data, v) => {
      void qc.invalidateQueries({ queryKey: ['approval', 'documents'] })
      void qc.invalidateQueries({ queryKey: ['approval', 'document', v.documentId] })
    },
  })
}

/** 기안 회수·문서 비활성화(소프트 삭제). 기안자·management 쓰기 권한자만 통과한다. */
export function useDeleteApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('approval_documents')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approval', 'documents'] })
    },
  })
}

/**
 * 열람 확인 스탬프 — 문서를 연 순간 본인 행을 upsert한다(확인함 뱃지·참조자
 * 체크마크의 원천). 본인 행만 쓸 수 있음은 RLS가 강제한다.
 */
export function useMarkApprovalRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { documentId: string; userId: string }) => {
      const { error } = await supabase
        .from('approval_reads')
        .upsert(
          { document_id: v.documentId, user_id: v.userId, read_at: new Date().toISOString() },
          { onConflict: 'document_id,user_id' },
        )
      if (error) throw error
    },
    onSuccess: (_data, v) => {
      void qc.invalidateQueries({ queryKey: ['approval', 'documents'] })
      void qc.invalidateQueries({ queryKey: ['approval', 'document', v.documentId] })
    },
  })
}
