import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ApprovalStatus } from '@/features/management/config'
import { docTypeName } from '@/features/approval/model'
import type { ProgramLinkType } from '@/features/approval/programLinkApi'

/**
 * 역방향 조회 — 특정 사업(AC/M&A/PROJECT)에 걸린 전자결재 문서 목록.
 *
 * 연동 원장(approval_program_links)은 방향 있는 참조라 행이 늘 `문서 → 사업` 한 방향으로
 * 저장된다. 그래도 **읽는 쪽은 양방향이어야 한다** — 결재 문서를 열면 "이게 어느 사업 건인가"를
 * 묻고, 사업을 열면 "이 사업으로 무슨 결재가 오갔나"를 묻기 때문이다. 같은 한 행을 양쪽에서
 * 각자의 질문으로 읽는 것이며, 그래서 사업 쪽에 링크를 복제해 두지 않는다(복제하면 두 목록이
 * 어긋났을 때 어느 쪽이 진짜인지 판정할 근거가 사라진다).
 *
 * 보이는 범위는 서버가 가른다 — 링크 SELECT 정책이 `app.can_read_approval(document_id)`라
 * 열람 불가한 문서의 링크 행은 애초에 돌아오지 않는다. 즉 이 패널이 사업 화면에서 남의
 * 결재 내용을 흘리지 않는다(관련 회의록 패널과 같은 구조).
 */
export interface RelatedApproval {
  id: string
  title: string
  /** 문서 번호. 상신 전에는 비어 있을 수 있다. */
  docNo: string | null
  /** 문서 종류(양식명 · 구 문서는 legacy form_type 라벨). */
  docType: string
  status: ApprovalStatus
  /** 기안일(ISO). 표기는 화면이 앞 10자만 자른다. */
  createdAt: string
}

interface LinkRow {
  approval_documents: {
    id: string
    title: string
    doc_no: string | null
    form_type: string
    status: ApprovalStatus
    created_at: string
    form: { name: string } | null
  } | null
}

/** 이 사업에 걸린, 요청자가 열람 가능한 결재 문서. 기안일 내림차순. */
export function useRelatedApprovals(
  targetType: ProgramLinkType,
  targetId: string | undefined,
) {
  return useQuery({
    queryKey: ['approval', 'related', targetType, targetId],
    enabled: Boolean(targetId),
    queryFn: async (): Promise<RelatedApproval[]> => {
      const { data, error } = await supabase
        .from('approval_program_links')
        // document_id → approval_documents.id FK가 유일하므로 테이블명 임베드로 문서를 끌어온다.
        // `!inner`를 쓰는 이유는 아래 두 필터가 임베드 열을 걸기 때문이다 — 바깥 조인이면
        // 문서가 걸러진 자리에 링크 행만 null을 달고 남는다.
        .select(
          'id, approval_documents!inner(id, title, doc_no, form_type, status, created_at, form:form_id(name))',
        )
        .eq('target_type', targetType)
        .eq('target_id', targetId as string)
        .is('deleted_at', null)
        // 소프트삭제된 문서는 뺀다. 링크 SELECT 정책이 이미 걸러 주지만 management·ADMIN은
        // 그 판정을 건너뛰므로(can_read_approval의 첫 두 줄) 여기서 한 번 더 막는다.
        .is('approval_documents.deleted_at', null)
        // 임시저장은 아직 조직의 문서가 아니다 — 기안을 쓰다 만 사람의 연동이 사업 상세에
        // 서면, 존재하지 않는 결재가 이 사업에 걸린 것으로 읽힌다(원장 주석과 같은 이유).
        .neq('approval_documents.status', 'DRAFT')
      if (error) throw error

      const items = ((data ?? []) as unknown as LinkRow[])
        .map((r) => r.approval_documents)
        .filter((d): d is NonNullable<LinkRow['approval_documents']> => d != null)
        .map((d) => ({
          id: d.id,
          title: d.title,
          docNo: d.doc_no,
          docType: docTypeName(d),
          status: d.status,
          createdAt: d.created_at,
        }))

      // 기안일 내림차순. PostgREST 임베드 정렬 대신 클라이언트에서 정렬한다(관련 회의록과 동일).
      return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
  })
}
