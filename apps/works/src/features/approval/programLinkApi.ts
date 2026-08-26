import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { MINUTE_LINK_TARGETS, type MinuteLinkPickKind } from '@/features/office/minutes/minuteLinks'

/**
 * 결재 문서에 걸 수 있는 사업 원장 3종. 값은 DB의 다형 키(approval_program_links.target_type)이자
 * 사업 워크스페이스의 entityKey이며, 셋 다 CHECK 제약으로 고정되어 있다.
 */
export type ProgramLinkType = 'program' | 'ma_program' | 'project_program'

/** 종류를 늘 이 순서로 놓는다(AC → M&A → PROJECT). */
export const PROGRAM_LINK_TYPES: ProgramLinkType[] = ['program', 'ma_program', 'project_program']

/**
 * 원장 테이블·상세 경로·라벨은 회의록 연동이 이미 소유한 메타(MINUTE_LINK_TARGETS)를
 * 그대로 읽는다 — 같은 원장을 가리키는 표를 두 벌 들고 있으면 라우트가 바뀌었을 때
 * 한쪽만 옛 경로로 남는다. 결재는 그중 사업 3종만 골라 쓴다.
 */
export const PROGRAM_LINK_META = MINUTE_LINK_TARGETS

/**
 * 피커의 '종류' 드롭다운 항목. 원장 하나가 곧 한 종류라 묶음이 없다(회의록의 '네트워크'처럼
 * 여러 원장을 한 항목으로 합치는 경우가 없다) — 후보 풀 훅이 요구하는 형태에 맞춰 감싸기만 한다.
 */
const programKind = (t: ProgramLinkType): MinuteLinkPickKind => ({
  key: t,
  label: MINUTE_LINK_TARGETS[t].kindLabel,
  types: [t],
})

export const PROGRAM_LINK_PICK_KINDS: MinuteLinkPickKind[] = PROGRAM_LINK_TYPES.map(programKind)

/** 피커 최초 진입 종류(AC 사업). */
export const DEFAULT_PROGRAM_LINK_KIND: MinuteLinkPickKind = programKind('program')

/** 드롭다운 선택값(key) → 종류. 모르는 값이면 기본 종류로 되돌린다. */
export function programLinkKind(key: string): MinuteLinkPickKind {
  return PROGRAM_LINK_PICK_KINDS.find((k) => k.key === key) ?? DEFAULT_PROGRAM_LINK_KIND
}

/** 결재 문서에 걸린 사업 1건(표시용). */
export interface ApprovalProgramLink {
  /** 링크 행 id — 해제할 때 쓴다. */
  linkId: string
  targetType: ProgramLinkType
  targetId: string
  /**
   * 사업명. **접근 불가(원장 RLS 차단) 대상은 null**이다 — 링크 행 자체는 문서를 읽을 수
   * 있으면 보이지만 사업 제목은 그 워크스페이스 열람 권한이 있어야 채워진다(회의록 연동과
   * 동일). 화면은 null을 '접근 권한 없음'으로 적는다.
   */
  title: string | null
  /** 사업코드. 제목과 같은 조건으로 채워진다. */
  code: string | null
  note: string | null
  createdAt: string
}

interface LinkRow {
  id: string
  target_type: ProgramLinkType
  target_id: string
  note: string | null
  created_at: string
}

/**
 * 원장 1종에서 걸린 사업들의 제목·코드를 가져온다. RLS가 접근 가능한 행만 돌려주므로
 * 권한 없는 사업은 아예 빠지고, 아래에서 null로 남는다.
 */
async function loadLabels(
  targetType: ProgramLinkType,
  ids: string[],
): Promise<Map<string, { title: string; code: string | null }>> {
  const map = new Map<string, { title: string; code: string | null }>()
  if (ids.length === 0) return map
  const meta = PROGRAM_LINK_META[targetType]
  // 소프트삭제된 사업도 제목을 채운다 — 걸었을 당시의 사실을 지우면 이 결재가 어느 사업의
  // 일이었는지 되짚을 수 없고, 빈 제목이 '접근 권한 없음'으로 잘못 읽힌다.
  const cols = ['id', meta.titleColumn, meta.codeColumn].filter(Boolean).join(', ')
  const { data, error } = await supabase.from(meta.table).select(cols).in('id', ids)
  if (error) throw error
  for (const row of (data ?? []) as unknown as Record<string, string | null>[]) {
    map.set(row.id as string, {
      title: (row[meta.titleColumn] as string) ?? '(제목 없음)',
      code: meta.codeColumn ? ((row[meta.codeColumn] as string | null) ?? null) : null,
    })
  }
  return map
}

/**
 * 이 결재 문서에 걸린 사업 목록.
 *
 * 두 단계로 읽는다 — 링크 행은 결재 정책(can_read_approval)이, 사업 제목은 각 사업 원장의
 * 정책이 가른다. 한 번의 임베드 조회로 끝내지 못하는 이유는 대상이 다형(원장 3종)이라
 * PostgREST가 걸 FK가 없기 때문이다.
 */
export function useApprovalProgramLinks(documentId: string | undefined) {
  return useQuery({
    queryKey: ['approval', 'program-links', documentId],
    enabled: Boolean(documentId),
    queryFn: async (): Promise<ApprovalProgramLink[]> => {
      const { data, error } = await supabase
        .from('approval_program_links')
        .select('id, target_type, target_id, note, created_at')
        .eq('document_id', documentId as string)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      if (error) throw error

      const rows = (data ?? []) as unknown as LinkRow[]
      const labelSets = await Promise.all(
        PROGRAM_LINK_TYPES.map(async (t) => {
          const ids = rows.filter((r) => r.target_type === t).map((r) => r.target_id)
          return [t, await loadLabels(t, ids)] as const
        }),
      )
      const labels = new Map(labelSets)

      return rows.map((r) => {
        const hit = labels.get(r.target_type)?.get(r.target_id) ?? null
        return {
          linkId: r.id,
          targetType: r.target_type,
          targetId: r.target_id,
          title: hit?.title ?? null,
          code: hit?.code ?? null,
          note: r.note,
          createdAt: r.created_at,
        }
      })
    },
  })
}

/** 연동할 대상 한 건(저장 payload). */
export interface ProgramLinkRef {
  targetType: ProgramLinkType
  targetId: string
}

/** 연동 대상 키(종류:id) — 중복 판정·React key 공용. */
export const programRefKey = (r: { targetType: string; targetId: string }) =>
  `${r.targetType}:${r.targetId}`

/**
 * 기안 화면이 들고 있는 연동 명단을 문서에 반영한다(추가분 INSERT, 빠진 것 soft delete).
 *
 * 화면이 거는 것과 떼는 것을 즉시 저장하지 않고 **저장 시점에 한 번** 맞추는 이유는,
 * 연동이 문서에 붙는 사실이지 그 자체로 완결된 행동이 아니기 때문이다 — 기안을 쓰다 말고
 * 나간 사람의 연동이 원장에 남으면, 아직 존재하지 않는 결재가 사업에 걸린 것으로 읽힌다.
 * 대상 사업 열람 권한과 문서 당사자 여부는 서버 RLS가 강제한다(화면의 후보 제한은 편의).
 */
export function useSyncProgramLinks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      documentId: string
      refs: ProgramLinkRef[]
      userId: string | null
    }) => {
      const { data, error } = await supabase
        .from('approval_program_links')
        .select('id, target_type, target_id')
        .eq('document_id', v.documentId)
        .is('deleted_at', null)
      if (error) throw error

      const current = (data ?? []) as unknown as {
        id: string
        target_type: ProgramLinkType
        target_id: string
      }[]
      const live = new Map(
        current.map((r) => [
          programRefKey({ targetType: r.target_type, targetId: r.target_id }),
          r,
        ]),
      )
      const wanted = new Set(v.refs.map(programRefKey))

      const added = v.refs.filter((r) => !live.has(programRefKey(r)))
      if (added.length > 0) {
        const { error: insertError } = await supabase.from('approval_program_links').insert(
          added.map((r) => ({
            document_id: v.documentId,
            target_type: r.targetType,
            target_id: r.targetId,
            created_by: v.userId,
          })),
        )
        if (insertError) throw insertError
      }

      // 뗀 것은 지우지 않고 deleted_at을 찍는다(원장 공통 규칙).
      const removed = [...live.entries()].filter(([k]) => !wanted.has(k)).map(([, r]) => r.id)
      if (removed.length > 0) {
        const { error: deleteError } = await supabase
          .from('approval_program_links')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', removed)
        if (deleteError) throw deleteError
      }
    },
    onSuccess: (_data, v) => {
      void qc.invalidateQueries({
        queryKey: ['approval', 'program-links', v.documentId],
      })
    },
  })
}
