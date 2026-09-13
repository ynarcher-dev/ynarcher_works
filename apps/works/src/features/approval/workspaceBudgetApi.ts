import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ApprovalStatus } from '@/features/management/config'
import { budgetField, parseFields, type FieldValues, type FormField } from '@/features/approval/fields'
import type { ProgramLinkType } from '@/features/approval/programLinkApi'

/**
 * 워크스페이스 하나에 배정된 예산 — PROJECT·M&A·FUND 상세의 '예산/지출' 탭이 읽는 자리.
 *
 * 무엇을 세는가: **승인이 끝난 품의 중 예산표를 가진 것**이다. 예산표를 가졌는지가 곧
 * "예산을 배정하는 품의인가"의 답이며(budget_link가 아니라 필드가 답한다), 승인 전 품의는
 * 아직 배정된 예산이 아니다 — 결재 중인 신청을 예산으로 세면 아무도 승인하지 않은 돈이
 * 화면에서 이미 쓸 수 있는 것처럼 보인다.
 *
 * 보이는 범위는 서버가 가른다 — 링크 SELECT 정책이 `app.can_read_approval(document_id)`라
 * 열람할 수 없는 품의는 애초에 돌아오지 않는다. 비어 있는 것과 막힌 것은 화면이 구분한다.
 */
export interface WorkspaceBudgetDoc {
  id: string
  title: string
  docNo: string | null
  status: ApprovalStatus
  createdAt: string
  /** 양식명. 탭 이름이 제목만으로 갈리지 않을 때 곁들인다. */
  formName: string | null
  /** 이 품의의 예산표 필드(반드시 있다 — 없는 문서는 목록에서 빠진다). */
  field: FormField
  values: FieldValues
}

interface LinkRow {
  approval_documents: {
    id: string
    title: string
    doc_no: string | null
    status: ApprovalStatus
    created_at: string
    field_values: FieldValues
    form: { name: string; budget_link: string | null } | null
    version: { fields: unknown } | null
  } | null
}

export function useWorkspaceBudgets(
  targetType: ProgramLinkType,
  targetId: string | undefined,
) {
  return useQuery({
    queryKey: ['approval', 'workspace-budget', targetType, targetId],
    enabled: Boolean(targetId),
    queryFn: async (): Promise<WorkspaceBudgetDoc[]> => {
      const { data, error } = await supabase
        .from('approval_program_links')
        .select(
          'id, approval_documents!inner(id, title, doc_no, status, created_at, field_values, ' +
            'form:form_id(name, budget_link), version:form_version_id(fields))',
        )
        .eq('target_type', targetType)
        .eq('target_id', targetId as string)
        .is('deleted_at', null)
        .is('approval_documents.deleted_at', null)
        .eq('approval_documents.status', 'APPROVED')
      if (error) throw error

      const docs: WorkspaceBudgetDoc[] = []
      for (const row of (data ?? []) as unknown as LinkRow[]) {
        const d = row.approval_documents
        if (!d) continue
        const field = budgetField(parseFields(d.version?.fields))
        // 예산표가 없으면 배정 품의가 아니다(일반 결재도 같은 원장으로 사업에 걸린다).
        if (!field) continue
        // 예산 변경 품의는 배정이 아니다 — 그 금액은 원 품의에 이미 반영되어 있어,
        // 여기 한 줄을 더 세우면 같은 예산이 두 번 배정된 것처럼 보인다.
        if (d.form?.budget_link === 'REVISE') continue
        docs.push({
          id: d.id,
          title: d.title,
          docNo: d.doc_no,
          status: d.status,
          createdAt: d.created_at,
          formName: d.form?.name ?? null,
          field,
          values: d.field_values ?? {},
        })
      }
      return docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
  })
}

/** 한 예산 줄에서 나간 결재 1건. */
export interface BudgetSpendItem {
  lineId: string
  documentId: string
  docNo: string | null
  title: string | null
  status: ApprovalStatus
  amount: number
  createdAt: string
  /** 이 지출 문서를 열어 볼 수 있는가. false면 제목·번호가 비어 온다(금액은 사실 그대로). */
  readable: boolean
}

/**
 * 예산 줄별 지출 내역 — 합계가 아니라 **건별**이다.
 *
 * 서버 RPC(public.approval_budget_spend_items)가 게이트와 투영을 모두 갖는다. 화면이
 * 지출 문서를 직접 훑지 않는 이유는, 열람할 수 없는 지출이 조용히 빠져 합계보다 모자란
 * 목록이 서면 남은 예산이 거짓으로 보이기 때문이다.
 */
export function useBudgetSpendItems(documentId: string | undefined) {
  return useQuery({
    queryKey: ['approval', 'workspace-budget', 'spend-items', documentId],
    enabled: Boolean(documentId),
    staleTime: 0,
    queryFn: async (): Promise<BudgetSpendItem[]> => {
      const { data, error } = await supabase.rpc('approval_budget_spend_items', {
        p_document_id: documentId as string,
      })
      if (error) throw error
      return ((data ?? []) as {
        line_id: string
        document_id: string
        doc_no: string | null
        title: string | null
        status: ApprovalStatus
        amount: string | number
        created_at: string
        readable: boolean
      }[]).map((r) => ({
        lineId: r.line_id,
        documentId: r.document_id,
        docNo: r.doc_no,
        title: r.title,
        status: r.status,
        amount: Number(r.amount),
        createdAt: r.created_at,
        readable: r.readable,
      }))
    },
  })
}
