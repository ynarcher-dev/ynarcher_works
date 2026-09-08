import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  fetchLedgerCandidates,
  loadLedgerFacts,
  type MasterCandidate,
} from '@/features/program/participantHooks'
import { type MasterTable } from '@/features/program/participantPersona'
import { SHARED_TABLES, useProgramWorkspace } from '@/features/program/workspace'

/**
 * 참가자 목록(사업 상세 `참가자 목록` 탭) 데이터 계층.
 *
 * **이 원장은 참가 사실 하나만 진다.** 게스트 계정·로그인 개방은 `participantHooks`가 다루는
 * `program_participants`의 축이고, 여기서는 그 값을 읽지도 쓰지도 않는다 — 담는 일이 곧
 * "게스트 계정이 있다"가 되던 것이 두 원장을 가른 이유다.
 *
 * **값은 복제하지 않고 원장을 가리킨다.** 기업명·대표자·이메일·연락처는 STARTUP·NETWORKS·
 * M&A 원장이 소유하므로 명단을 읽은 뒤 원장을 한 번 더 읽어 붙인다(GUEST 명부와 같은 방식이며
 * 그 합성 함수 `loadLedgerFacts`를 그대로 쓴다 — 원장이 컬럼 하나를 바꾸는 날 고칠 곳이 하나여야 한다).
 *
 * 근거: docs/docs_planning/3_4_4_ac_participant_pool.md
 */

export interface RosterRow {
  id: string
  master_table: MasterTable
  master_id: string
  /** 원장에서 온 대상 이름(기업명 또는 전문가명). */
  name: string
  /** 대표자·담당자·성명. 원장에 없으면 null. */
  contactName: string | null
  email: string | null
  phone: string | null
  createdAt: string
}

interface RawEntry {
  id: string
  master_table: MasterTable
  master_id: string
  created_at: string
}

/**
 * 명단 select — **표에 서는 넷과 그것을 세우는 데 필요한 것만** 읽는다.
 *
 * 생성자(`created_by`)는 원장에 남지만 목록에 세우지 않는다(2026-09-09 사용자 지정 컬럼 구성).
 * 어떤 권한도 주지 않는 서술 값이라 관리 주체를 답하지 못하고, 이 표가 답할 물음은
 * '누가 참가하는가' 하나다 — 담은 사람은 그 물음의 답이 아니다.
 */
const ENTRY_COLS = 'id, master_table, master_id, created_at'

/** 이 사업의 참가자 명단 전부(자격 탭은 화면이 거른다). 뺀 줄은 오지 않는다. */
export function useProgramRoster(programId: string | undefined) {
  const config = useProgramWorkspace()
  return useQuery({
    queryKey: [config.key, 'roster', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<RosterRow[]> => {
      const { data, error } = await supabase
        .from(SHARED_TABLES.participantEntries)
        .select(ENTRY_COLS)
        .eq('entity_key', config.entityKey)
        .eq('program_id', programId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      // 조회 실패를 삼키지 않는다 — 삼키면 "권한이 없다"와 "명단이 비었다"가 같은 화면이 된다.
      if (error) throw error
      const rows = (data ?? []) as unknown as RawEntry[]

      const facts = await loadLedgerFacts(rows)

      return rows.map((r) => {
        const master = facts.get(`${r.master_table}:${r.master_id}`)
        return {
          id: r.id,
          master_table: r.master_table,
          master_id: r.master_id,
          // 원장 행이 지워졌거나 읽을 권한이 없으면 이름을 지어내지 않는다.
          name: master?.name || '미지정',
          contactName: master?.loginName ?? null,
          email: master?.email ?? null,
          phone: master?.phone ?? null,
          createdAt: r.created_at,
        }
      })
    },
  })
}

/**
 * 원장 후보 검색(추가 모달). 이미 이 명단에 담긴 대상은 고를 수 없다.
 *
 * 대조 대상이 GUEST 명부가 아니라 이 명단이다 — 두 원장은 갈려 있으므로 계정이 있다는 것이
 * 명단에 있다는 뜻이 아니고, 그 반대도 아니다.
 */
export function useRosterCandidates(
  programId: string | undefined,
  master: MasterTable,
  search: string,
) {
  const config = useProgramWorkspace()
  const term = search.trim()
  return useQuery({
    queryKey: [config.key, 'roster-candidates', programId, master, term],
    enabled: Boolean(programId),
    queryFn: async (): Promise<MasterCandidate[]> => {
      const [candidates, taken] = await Promise.all([
        fetchLedgerCandidates(master, term),
        supabase
          .from(SHARED_TABLES.participantEntries)
          .select('master_id')
          .eq('entity_key', config.entityKey)
          .eq('program_id', programId)
          .eq('master_table', master)
          .is('deleted_at', null),
      ])
      if (taken.error) throw taken.error

      const mapped = new Set(
        ((taken.data ?? []) as { master_id: string }[]).map((r) => r.master_id),
      )
      return candidates.map((c) => ({ ...c, alreadyMapped: mapped.has(c.id) }))
    },
  })
}

/**
 * 원장에서 고른 대상을 명단에 담는다. **계정은 세우지 않는다** — 참가자 목록은 참가 사실
 * 하나만 답하는 자리이고, 게스트 계정은 이 명단에서 **골라서** 만드는 다음 결정이다
 * (자동으로 세우면 담는 일과 문을 여는 일이 다시 한 동작이 된다).
 */
export function useAddRosterEntries(programId: string) {
  const config = useProgramWorkspace()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { master: MasterTable; masterIds: string[] }): Promise<number> => {
      if (input.masterIds.length === 0) return 0
      const { error } = await supabase.from(SHARED_TABLES.participantEntries).insert(
        input.masterIds.map((masterId) => ({
          entity_key: config.entityKey,
          program_id: programId,
          master_table: input.master,
          master_id: masterId,
        })),
      )
      if (error) throw error
      return input.masterIds.length
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [config.key, 'roster', programId] })
      void qc.invalidateQueries({ queryKey: [config.key, 'roster-candidates', programId] })
    },
  })
}

/**
 * 명단에서 뺀다 — **소프트 삭제**(`deleted_at`)다. 뺐다는 사실도 기록이고, 유일 제약은 살아
 * 있는 줄에만 걸리므로 같은 대상을 다시 담을 수 있다.
 */
export function useRemoveRosterEntries(programId: string) {
  const config = useProgramWorkspace()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]): Promise<number> => {
      if (ids.length === 0) return 0
      const { error } = await supabase
        .from(SHARED_TABLES.participantEntries)
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids)
        .is('deleted_at', null)
      if (error) throw error
      return ids.length
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [config.key, 'roster', programId] })
      void qc.invalidateQueries({ queryKey: [config.key, 'roster-candidates', programId] })
    },
  })
}
