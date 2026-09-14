import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ApprovalStatus } from '@/features/management/config'
import { docTypeName } from '@/features/approval/model'
import type { ProgramLinkType } from '@/features/approval/programLinkApi'
import {
  orderApprovalTree,
  type ApprovalDoc,
  type ApprovalEdge,
  type ApprovalNode,
} from '@/features/approval/approvalTree'

/**
 * 역방향 조회 — 특정 워크스페이스(PROJECT·M&A·FUND)에 걸린 전자결재와 **거기 딸린 서류 전부**.
 *
 * 연동 원장(approval_program_links)은 방향 있는 참조라 행이 늘 `문서 → 워크스페이스` 한 방향으로
 * 저장된다. 그래도 **읽는 쪽은 양방향이어야 한다** — 결재 문서를 열면 "이게 어느 사업 건인가"를
 * 묻고, 사업을 열면 "이 사업으로 무슨 결재가 오갔나"를 묻기 때문이다. 같은 한 행을 양쪽에서
 * 각자의 질문으로 읽는 것이며, 그래서 사업 쪽에 링크를 복제해 두지 않는다.
 *
 * **딸린 서류를 원장에 복제하지 않고 읽을 때 펴는 이유도 같다**(2026-09-14). 품의 하나에 지출이
 * 붙고 그 지출에 구매내역이 붙으면 담당자가 찾는 것은 셋 전부인데, 그렇다고 세 건에 워크스페이스
 * 연동 행을 각자 만들면 같은 사실이 세 곳에 적히고 한 곳만 고쳐졌을 때 어느 쪽이 진짜인지 판정할
 * 근거가 사라진다. 게다가 배정 품의의 연동은 승인 뒤 불변이라(서버 트리거) 뒤늦게 붙는 지출이
 * 그 규칙과 부딪힌다. 원장은 사람이 적은 것만 담고, **계보는 읽을 때 편다.**
 *
 * 가지를 펴는 축은 둘이다.
 *
 * * **돈이 흐르는 축**(`approval_documents.budget_document_id`) — 이 품의를 근거로 쓴 지출결의와
 *   이 품의의 예산표를 갈아끼우는 예산 변경 품의. 방향이 정해진 사실이라 자동으로 끌어온다.
 * * **사람이 엮은 축**(`approval_document_links`) — 상호 참조로 걸린 관련 문서. 구매내역·계약서처럼
 *   결재로 올라간 제반 서류가 여기로 온다. 방향이 없는 관계라 양쪽 열을 모두 보고 편다.
 *
 * 두 축 모두 **가지 끝까지 따라간다**(품의 → 지출 → 구매내역). 다만 상호 참조는 사람이 임의로
 * 걸 수 있어 무한정 번질 수 있으므로 홉 수와 건수에 상한을 둔다 — 상한에 닿으면 목록이 잘릴 뿐
 * 거짓을 말하지는 않으며, 각 행은 자기가 어디에 매달렸는지(`relation`·`parentId`)를 들고 온다.
 *
 * 보이는 범위는 서버가 가른다 — 링크 SELECT 정책이 `app.can_read_approval(document_id)`이고
 * 문서 자체도 같은 기준의 RLS로 걸러지므로, 열람 불가한 문서는 딸린 서류든 아니든 애초에 돌아오지
 * 않는다. 즉 이 화면이 남의 결재 내용을 흘리지 않는다. 빈 목록은 '결재가 없다'가 아니라
 * '내가 볼 수 있는 것 중에 없다'이며, 화면의 빈 문구도 그렇게 적는다.
 */
export type { ApprovalNode }

/** 한 번의 요청에 묶는 id 수 — 목록이 길어도 URL이 터지지 않게 나눠 묻는다. */
const ID_CHUNK = 40
/** 가지를 펴는 최대 홉 수(뿌리 → 지출 → 구매내역 → …). */
const MAX_HOPS = 4
/** 목록 전체 상한. 상호 참조가 번져 화면이 사업과 무관한 문서로 덮이는 것을 막는다. */
const MAX_DOCS = 300

const DOC_SELECT =
  'id, title, doc_no, form_type, status, amount, created_at, deleted_at, budget_document_id, ' +
  'form:form_id(name, budget_link)'

interface DocRow {
  id: string
  title: string
  doc_no: string | null
  form_type: string
  status: ApprovalStatus
  amount: number | string | null
  created_at: string
  deleted_at: string | null
  budget_document_id: string | null
  form: { name: string; budget_link: string | null } | null
}

interface LinkRow {
  approval_documents: DocRow | null
}

interface CrossRefRow {
  note: string | null
  document_a: string
  document_b: string
  a: DocRow | null
  b: DocRow | null
}

/**
 * 목록에 세울 수 있는 문서인가.
 *
 * 소프트삭제 문서는 뺀다 — 링크 SELECT 정책이 이미 걸러 주지만 management·ADMIN은 그 판정을
 * 건너뛴다(can_read_approval의 첫 두 줄). 임시저장도 뺀다: 아직 조직의 문서가 아니라, 기안을
 * 쓰다 만 사람의 연동이 사업 상세에 서면 존재하지 않는 결재가 이 사업에 걸린 것으로 읽힌다.
 */
function usable(row: DocRow | null): row is DocRow {
  return row != null && row.deleted_at == null && row.status !== 'DRAFT'
}

function toDoc(row: DocRow): ApprovalDoc {
  return {
    id: row.id,
    title: row.title,
    docNo: row.doc_no,
    docType: docTypeName(row),
    status: row.status,
    // numeric 열은 PostgREST가 정밀도를 지키려 문자열로 보낼 때가 있다 — 화면에 넘기기 전에
    // 한 번만 수로 만든다(빈 문자열·해석 불가는 금액 없음으로 본다).
    amount: row.amount == null || row.amount === '' ? null : Number(row.amount),
    createdAt: row.created_at,
  }
}

function chunked(ids: string[]): string[][] {
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK) out.push(ids.slice(i, i + ID_CHUNK))
  return out
}

/** 이 워크스페이스에 직접 연동된 문서(뿌리). */
async function loadRoots(targetType: ProgramLinkType, targetId: string): Promise<DocRow[]> {
  const { data, error } = await supabase
    .from('approval_program_links')
    // document_id → approval_documents.id FK가 유일하므로 테이블명 임베드로 문서를 끌어온다.
    // `!inner`를 쓰는 이유는 아래 필터가 임베드 열을 걸기 때문이다 — 바깥 조인이면
    // 문서가 걸러진 자리에 링크 행만 null을 달고 남는다.
    .select(`id, approval_documents!inner(${DOC_SELECT})`)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .is('deleted_at', null)
    .is('approval_documents.deleted_at', null)
    .neq('approval_documents.status', 'DRAFT')
  if (error) throw error
  return ((data ?? []) as unknown as LinkRow[]).map((r) => r.approval_documents).filter(usable)
}

/** 이 문서들을 **근거 품의로 지목한** 문서(지출결의·예산 변경 품의). */
async function loadBudgetChildren(parentIds: string[]): Promise<DocRow[]> {
  const rows: DocRow[] = []
  for (const ids of chunked(parentIds)) {
    const { data, error } = await supabase
      .from('approval_documents')
      .select(DOC_SELECT)
      .in('budget_document_id', ids)
      .is('deleted_at', null)
      .neq('status', 'DRAFT')
    if (error) throw error
    rows.push(...((data ?? []) as unknown as DocRow[]).filter(usable))
  }
  return rows
}

/** 이 문서들과 상호 참조로 엮인 문서. 쌍마다 행이 하나뿐이라 두 열을 모두 본다. */
async function loadCrossRefs(parentIds: string[]): Promise<CrossRefRow[]> {
  const rows: CrossRefRow[] = []
  for (const ids of chunked(parentIds)) {
    const list = ids.join(',')
    const { data, error } = await supabase
      .from('approval_document_links')
      .select(
        `note, document_a, document_b, a:document_a(${DOC_SELECT}), b:document_b(${DOC_SELECT})`,
      )
      .is('deleted_at', null)
      .or(`document_a.in.(${list}),document_b.in.(${list})`)
    if (error) throw error
    rows.push(...((data ?? []) as unknown as CrossRefRow[]))
  }
  return rows
}

/**
 * 워크스페이스에 걸린 결재와 그에 딸린 서류. 뿌리는 기안일 내림차순이고, 딸린 것은 부모 바로
 * 아래에 선다(`orderApprovalTree`가 순서와 들여쓰기 깊이를 함께 소유한다).
 */
export function useWorkspaceApprovals(targetType: ProgramLinkType, targetId: string | undefined) {
  return useQuery({
    queryKey: ['approval', 'workspace-docs', targetType, targetId],
    enabled: Boolean(targetId),
    queryFn: async (): Promise<ApprovalNode[]> => {
      const rootRows = await loadRoots(targetType, targetId as string)
      const docs = new Map<string, ApprovalDoc>()
      const edges: ApprovalEdge[] = []
      const roots = rootRows.map(toDoc)
      for (const doc of roots) docs.set(doc.id, doc)

      let frontier = roots.map((d) => d.id)
      for (let hop = 0; hop < MAX_HOPS && frontier.length > 0 && docs.size < MAX_DOCS; hop += 1) {
        const known = new Set(docs.keys())
        const found: DocRow[] = []

        for (const row of await loadBudgetChildren(frontier)) {
          const parentId = row.budget_document_id
          if (!parentId || !known.has(parentId)) continue
          // 예산표를 갈아끼우는 변경 품의와 그 돈을 쓰는 지출은 같은 칸을 쓰지만 다른 사실이다.
          edges.push({
            parentId,
            childId: row.id,
            relation: row.form?.budget_link === 'REVISE' ? 'REVISE' : 'SPEND',
          })
          found.push(row)
        }

        for (const link of await loadCrossRefs(frontier)) {
          // 이미 목록에 있는 쪽이 부모고 그 반대쪽이 딸려 온다. 둘 다 이미 있으면 새 가지가
          // 아니라 같은 문서로 되돌아오는 길이며, 그 되돌이는 순회의 dedupe가 막는다.
          const parentId = known.has(link.document_a)
            ? link.document_a
            : known.has(link.document_b)
              ? link.document_b
              : null
          if (!parentId) continue
          const other = parentId === link.document_a ? link.b : link.a
          if (!usable(other) || other.id === parentId) continue
          edges.push({ parentId, childId: other.id, relation: 'REF', note: link.note })
          found.push(other)
        }

        const next: string[] = []
        for (const row of found) {
          if (docs.has(row.id)) continue
          if (docs.size >= MAX_DOCS) break
          docs.set(row.id, toDoc(row))
          next.push(row.id)
        }
        frontier = next
      }

      return orderApprovalTree(roots, edges, docs)
    },
  })
}
