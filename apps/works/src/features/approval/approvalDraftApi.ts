import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { FieldValues } from '@/features/approval/fields'
import type { ApprovalLineInput, CreateApprovalInput } from '@/features/approval/approvalApi'

/**
 * 기안자가 자기 문서에 하는 일 — 저장·재상신·기안 취소·기안 삭제.
 *
 * 목록·상세·결재 처리(`approvalApi.ts`)와 파일을 나눈 기준은 **누가 부르는가**다. 이쪽 다섯은
 * 전부 기안자 본인만 통과하고(서버도 `drafter_id = 호출자`로 판정한다) 고치는 대상이 자기가
 * 만든 한 문서다. 저쪽은 보는 사람과 결재하는 사람의 경로다.
 *
 * 판정 규칙은 여기 적지 않는다 — 무엇을 할 수 있는가는 `approvalDraftActions.ts`가 답하고
 * 이 파일은 부르는 일만 한다.
 */
export interface SaveDraftInput extends CreateApprovalInput {
  /** 고칠 임시저장 문서. */
  documentId: string
}

/**
 * 임시저장 문서 수정 — 값과 결재선을 통째로 갈아끼운다.
 *
 * 결재선 교체가 `save_approval_draft` RPC 한 경로로만 이뤄지는 이유는, 기존 결재선 행을
 * 지워야 하는데 `approval_lines`·`approval_recipients`에 DELETE 정책이 없기 때문이다
 * (보안 게이트가 업무 테이블의 DELETE 정책을 금지한다). 삭제 권한을 테이블에 상시로 여는
 * 대신 "내가 기안한 DRAFT 문서"라는 조건을 함수 안에서 확인하고 그 안에서만 교체한다.
 * 문서 번호 채번은 상신 시 DB 트리거가 맡으므로 여기서 만들지 않는다.
 */
export function useSaveApprovalDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: SaveDraftInput): Promise<string> => {
      const lineRows = (Object.keys(v.lines) as (keyof ApprovalLineInput)[]).flatMap((kind) =>
        v.lines[kind].map((approver_id, i) => ({
          approver_id,
          step_order: i + 1,
          kind,
        })),
      )
      const { error } = await supabase.rpc('save_approval_draft', {
        p_document_id: v.documentId,
        p_title: v.title,
        p_form_id: v.formId,
        p_form_version_id: v.formVersionId,
        p_field_values: v.fieldValues,
        p_department_id: v.departmentId,
        p_lines: lineRows,
        p_recipient_ids: v.recipientIds,
        p_submit: !v.asDraft,
        p_budget_document_id: v.budgetDocumentId ?? null,
      })
      if (error) throw error
      return v.documentId
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
 * 재상신 — 보완 요청으로 멈춘(REVISION_REQUIRED) 문서를 고쳐 다시 올린다.
 *
 * 임시저장 수정(`save_approval_draft`)과 경로를 나눈 이유는 그 함수가 결재선을 통째로
 * `delete` 후 재삽입하기 때문이다. 도장이 찍힌 행을 지우게 되므로 재상신은 **값만 고치고
 * 결재선은 건드리지 않는다.** 서버가 보완 요청 자리와 아직 처리하지 않은 자리만 새 회차에
 * 세워 기존 결재를 이어간다.
 */
export function useResubmitApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      documentId: string
      title: string
      fieldValues: FieldValues
    }): Promise<string> => {
      const { error } = await supabase.rpc('resubmit_approval_document', {
        p_document_id: v.documentId,
        p_title: v.title,
        p_field_values: v.fieldValues,
      })
      if (error) throw error
      return v.documentId
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
 * 기안 취소 — 최종 승인 전 문서를 기안 단계로 되돌린다.
 *
 * 서버가 기안자 여부·상태·이관 여부를 다시 확인하고, 지난 회차 도장을 이력으로 남긴 채
 * 전 결재선을 새 회차 PENDING으로 복제한다. 그래서 재상신하면 처음 사람부터 다시 받는다.
 */
export function useWithdrawApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { documentId: string; reason: string }) => {
      const { error } = await supabase.rpc('withdraw_approval_document', {
        p_document_id: v.documentId,
        p_reason: v.reason.trim(),
      })
      if (error) throw error
    },
    onSuccess: (_data, v) => {
      void qc.invalidateQueries({ queryKey: ['approval', 'documents'] })
      void qc.invalidateQueries({ queryKey: ['approval', 'document', v.documentId] })
    },
  })
}

/**
 * 기안 삭제 — 기안 단계 문서의 물리 삭제.
 *
 * 종전에는 `deleted_at`을 직접 UPDATE했다(어느 화면에도 걸려 있지 않은 죽은 경로였고,
 * 기안자에게 열린 UPDATE 정책 때문에 상태와 무관하게 통했다). 이제 경로는 자체 인가하는
 * RPC 하나뿐이며 정책도 소프트 삭제를 막는다 — 상태 검사와 감사 적재를 건너뛸 길이 없다.
 */
export function useDeleteApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await supabase.rpc('delete_approval_document', {
        p_document_id: documentId,
      })
      if (error) throw error
    },
    onSuccess: (_data, documentId) => {
      void qc.invalidateQueries({ queryKey: ['approval', 'documents'] })
      void qc.removeQueries({ queryKey: ['approval', 'document', documentId] })
    },
  })
}

/**
 * 삭제창이 밝힐 잔존물 건수 — 첨부와 의견.
 *
 * 세는 이유는 되돌릴 수 없는 작업에서 무엇이 함께 사라지는지 건수로 말해야 하기 때문이다
 * (모듈 삭제창과 같은 규칙). 결재선·참조자·연동은 세지 않는다 — 그 문서의 세간이라 문서가
 * 사라지면 당연히 함께 사라지고, 건수로 적으면 경고가 사실보다 커진다.
 */
export function useApprovalDeletePreview(documentId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['approval', 'delete-preview', documentId],
    enabled: Boolean(documentId) && enabled,
    queryFn: async (): Promise<{ attachments: number; comments: number }> => {
      const [files, comments] = await Promise.all([
        supabase
          .from('attachments')
          .select('id', { count: 'exact', head: true })
          .eq('target_type', 'approval')
          .eq('target_id', documentId!)
          .is('deleted_at', null),
        supabase
          .from('entity_feedback')
          .select('id', { count: 'exact', head: true })
          .eq('target_type', 'approval')
          .eq('target_id', documentId!)
          .is('deleted_at', null),
      ])
      if (files.error) throw files.error
      if (comments.error) throw comments.error
      return { attachments: files.count ?? 0, comments: comments.count ?? 0 }
    },
  })
}
