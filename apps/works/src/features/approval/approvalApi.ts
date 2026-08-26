import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ApprovalListRow } from '@/features/approval/model'

/** 문서함 목록 select — model.ApprovalListRow와 형태가 일치해야 한다. */
const LIST_SELECT =
  'id, title, doc_no, form_type, status, drafter_id, department_id, amount, created_at, completed_at, ' +
  'form:form_id(name), ' +
  'approval_lines(approver_id, step_order, decision), ' +
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
  abbrev: string
  retention: string
  security_grade: string
  is_active: boolean
  sort_order: number
  current_version_id: string | null
}

/** 결재 양식 목록(기안 화면의 양식 선택지). 비활성 양식은 새 기안에서 제외한다. */
export function useApprovalForms() {
  return useQuery({
    queryKey: ['approval', 'forms'],
    queryFn: async (): Promise<ApprovalForm[]> => {
      const { data, error } = await supabase
        .from('approval_forms')
        .select('id, name, abbrev, retention, security_grade, is_active, sort_order, current_version_id')
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []) as ApprovalForm[]
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approval', 'documents'] })
    },
  })
}
