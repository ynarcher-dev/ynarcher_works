import type { ApprovalStatus } from '@/features/management/config'

/**
 * 워크스페이스에 딸린 결재 문서의 계보 — 무엇 때문에 이 목록에 섰는가.
 *
 * * `DIRECT` — 기안 화면에서 이 워크스페이스를 직접 고른 문서(연동 원장에 행이 있다).
 * * `SPEND` — 그 문서를 **근거 품의**로 삼아 돈을 쓴 문서(지출결의·법인카드 등).
 * * `REVISE` — 그 품의의 예산표를 갈아끼우는 예산 변경 품의.
 * * `REF` — 상호 참조로 걸린 관련 문서(구매내역·계약서처럼 결재로 올라간 제반 서류).
 *
 * 앞의 셋은 원장에 **방향이 있는 사실**(돈이 어디서 흘러왔는가)이고 마지막 하나는 사람이
 * "관련 있다"고 적은 것이다. 그래서 화면이 관계를 숨기지 않고 한 열로 적는다 — 왜 이 문서가
 * 이 사업 목록에 섰는지는 목록 자체가 답해야 한다.
 */
export type ApprovalRelation = 'DIRECT' | 'SPEND' | 'REVISE' | 'REF'

export const APPROVAL_RELATION_LABEL: Record<ApprovalRelation, string> = {
  DIRECT: '직접 연결',
  SPEND: '지출',
  REVISE: '예산 변경',
  REF: '관련 문서',
}

/** 목록에 서는 결재 문서 한 건(계보와 무관한 문서 자체의 사실). */
export interface ApprovalDoc {
  id: string
  title: string
  /** 문서 번호. 상신 전에는 비어 있을 수 있다. */
  docNo: string | null
  /** 문서 종류(양식명 · 구 문서는 legacy form_type 라벨). */
  docType: string
  status: ApprovalStatus
  /**
   * 문서 금액(원). 양식의 대표 금액을 DB 트리거가 파생해 둔 값이다 — 품의는 예산표 합계,
   * 지출은 내역 표의 합계다. **화면이 다시 세지 않는다**: 같은 금액을 두 곳에서 각자 계산하면
   * 예산 변경이 적용된 뒤 두 숫자가 갈린다. 대표 금액이 없는 양식(휴가원 등)은 null이다.
   */
  amount: number | null
  /** 기안일(ISO). 표기는 화면이 앞 10자만 자른다. */
  createdAt: string
}

/** 부모 문서에 자식 문서가 매달린 한 줄. 방향은 늘 `이미 목록에 있는 쪽 → 딸려 오는 쪽`이다. */
export interface ApprovalEdge {
  parentId: string
  childId: string
  relation: Exclude<ApprovalRelation, 'DIRECT'>
  /** 상호 참조에 적힌 메모(왜 엮었는지). 다른 관계에는 없다. */
  note?: string | null
}

export interface ApprovalNode extends ApprovalDoc {
  /** 0 = 직접 연결된 문서. 1 이상은 그 문서에 딸린 것들. */
  depth: number
  relation: ApprovalRelation
  parentId: string | null
  note: string | null
}

/**
 * 뿌리(직접 연결 문서)에서 가지를 펴 **보이는 순서 그대로의 한 줄짜리 목록**을 만든다.
 *
 * 표는 계층을 그리지 못하므로 순서가 계층을 대신한다 — 부모 바로 아래에 그 자식들이 오고,
 * 들여쓰기는 `depth`가 답한다. 그래서 이 함수가 정렬까지 소유한다(표에서 열을 눌러 다시
 * 정렬하면 계보가 흩어지므로, 부르는 화면은 정렬을 켜지 않는다).
 *
 * **한 문서는 한 번만 선다.** 같은 문서가 두 경로로 닿을 수 있고 상호 참조는 방향이 없어
 * 되돌아오기까지 한다. 먼저 닿은 자리가 남으며, 그쪽이 더 짧은 경로이므로 더 직접적인 근거다.
 *
 * **직접 연동된 문서는 언제나 뿌리에 선다.** 지출이 근거 품의에도 매달려 있고 기안자가 이
 * 워크스페이스를 직접 골라 두기도 한 경우, 가지 아래로 내려보내면 사람이 적어 둔 사실(이 문서는
 * 이 사업 건이다)이 화면에서 사라진다. 그래서 뿌리 자리를 먼저 잡아 두고 가지를 편다.
 *
 * 자식들 사이의 순서는 기안일 내림차순이다(목록 전체가 쓰는 순서와 같다).
 */
export function orderApprovalTree(
  roots: ApprovalDoc[],
  edges: ApprovalEdge[],
  docs: Map<string, ApprovalDoc>,
): ApprovalNode[] {
  const childEdges = new Map<string, ApprovalEdge[]>()
  for (const edge of edges) {
    const list = childEdges.get(edge.parentId)
    if (list) list.push(edge)
    else childEdges.set(edge.parentId, [edge])
  }

  const rootIds = new Set(roots.map((r) => r.id))
  const seen = new Set<string>()
  const out: ApprovalNode[] = []

  const visit = (
    doc: ApprovalDoc,
    depth: number,
    relation: ApprovalRelation,
    parentId: string | null,
    note: string | null,
  ) => {
    if (seen.has(doc.id)) return
    // 뿌리는 자기 자리에서만 선다 — 가지를 펴다 만나면 건너뛴다(아래 뿌리 순회가 세운다).
    if (depth > 0 && rootIds.has(doc.id)) return
    seen.add(doc.id)
    out.push({ ...doc, depth, relation, parentId, note })

    const next = (childEdges.get(doc.id) ?? [])
      .map((edge) => ({ edge, child: docs.get(edge.childId) }))
      .filter((pair): pair is { edge: ApprovalEdge; child: ApprovalDoc } => pair.child != null)
      .sort((a, b) => b.child.createdAt.localeCompare(a.child.createdAt))
    for (const { edge, child } of next) {
      visit(child, depth + 1, edge.relation, doc.id, edge.note ?? null)
    }
  }

  for (const root of [...roots].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    visit(root, 0, 'DIRECT', null, null)
  }
  return out
}
