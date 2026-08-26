import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ApprovalStatus } from '@/features/management/config'

/** 상호 참조로 걸린 상대 문서 한 건(내 쪽이 아니라 **저쪽** 문서의 정보다). */
export interface LinkedDocument {
  /** 링크 행 id — 해제할 때 쓴다. */
  linkId: string
  note: string | null
  id: string
  title: string
  docNo: string | null
  status: ApprovalStatus
  createdAt: string
  formName: string | null
}

const LINK_SELECT =
  'id, note, document_a, document_b, ' +
  'a:document_a(id, title, doc_no, status, created_at, form:form_id(name)), ' +
  'b:document_b(id, title, doc_no, status, created_at, form:form_id(name))'

interface LinkedDocRow {
  id: string
  title: string
  doc_no: string | null
  status: ApprovalStatus
  created_at: string
  form: { name: string } | null
}

interface LinkRow {
  id: string
  note: string | null
  document_a: string
  document_b: string
  a: LinkedDocRow | null
  b: LinkedDocRow | null
}

/**
 * 쌍은 늘 (작은 id, 큰 id)로 저장한다 — DB의 CHECK(document_a < document_b)와 같은 규칙.
 * 화면이 고른 순서를 그대로 넣으면 같은 쌍이 뒤집힌 채 한 번 더 들어가 목록에 두 번 뜬다.
 */
function orderedPair(x: string, y: string): { document_a: string; document_b: string } {
  return x < y ? { document_a: x, document_b: y } : { document_a: y, document_b: x }
}

/**
 * 상호 참조 문서 목록.
 *
 * 참조는 방향이 없는 관계라 원장에 행이 **쌍마다 하나**뿐이다(A→B와 B→A를 따로 넣지 않는다).
 * 그래서 조회는 두 열을 모두 보고(`document_a = 나 or document_b = 나`), 걸린 행에서
 * **내가 아닌 쪽**을 골라 상대 문서로 편다. 이 한 번의 뒤집기가 '상호 참조'의 전부다.
 */
export function useDocumentLinks(documentId: string | undefined) {
  return useQuery({
    queryKey: ['approval', 'links', documentId],
    enabled: Boolean(documentId),
    queryFn: async (): Promise<LinkedDocument[]> => {
      const { data, error } = await supabase
        .from('approval_document_links')
        .select(LINK_SELECT)
        .is('deleted_at', null)
        .or(`document_a.eq.${documentId},document_b.eq.${documentId}`)
        .order('created_at', { ascending: false })
      if (error) throw error

      return ((data ?? []) as unknown as LinkRow[])
        .map((row) => {
          // 내가 아닌 쪽이 상대 문서다.
          const other = row.document_a === documentId ? row.b : row.a
          if (!other) return null
          return {
            linkId: row.id,
            note: row.note,
            id: other.id,
            title: other.title,
            docNo: other.doc_no,
            status: other.status,
            createdAt: other.created_at,
            formName: other.form?.name ?? null,
          }
        })
        .filter((v): v is LinkedDocument => v !== null)
    },
  })
}

/**
 * 기안 화면이 들고 있는 참조 명단을 문서에 반영한다(추가분 INSERT, 빠진 것 soft delete).
 *
 * 연동과 마찬가지로 저장 시점에 한 번 맞춘다 — 참조는 문서에 붙는 사실이라, 기안을 쓰다 만
 * 문서의 참조가 상대 문서 상세에 먼저 나타나면 안 된다(참조는 방향이 없어 양쪽에 보인다).
 * 양쪽 문서의 당사자여야 한다는 것은 서버 RLS가 강제한다.
 */
export function useSyncDocumentLinks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { documentId: string; targetIds: string[]; userId: string | null }) => {
      const { data, error } = await supabase
        .from('approval_document_links')
        .select('id, document_a, document_b')
        .is('deleted_at', null)
        .or(`document_a.eq.${v.documentId},document_b.eq.${v.documentId}`)
      if (error) throw error

      const current = (data ?? []) as unknown as {
        id: string
        document_a: string
        document_b: string
      }[]
      // 내가 아닌 쪽이 상대 문서다(조회와 같은 뒤집기).
      const live = new Map(
        current.map((r) => [r.document_a === v.documentId ? r.document_b : r.document_a, r.id]),
      )
      const wanted = new Set(v.targetIds)

      const added = v.targetIds.filter((id) => !live.has(id))
      if (added.length > 0) {
        const { error: insertError } = await supabase.from('approval_document_links').insert(
          added.map((targetId) => ({
            ...orderedPair(v.documentId, targetId),
            created_by: v.userId,
          })),
        )
        if (insertError) throw insertError
      }

      const removed = [...live.entries()]
        .filter(([id]) => !wanted.has(id))
        .map(([, linkId]) => linkId)
      if (removed.length > 0) {
        const { error: deleteError } = await supabase
          .from('approval_document_links')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', removed)
        if (deleteError) throw deleteError
      }
    },
    // 상대 문서의 목록도 함께 바뀐다(같은 행을 양쪽이 읽으므로) — 키 전체를 무효화한다.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approval', 'links'] })
    },
  })
}
