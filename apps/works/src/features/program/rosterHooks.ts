import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  fetchLedgerCandidates,
  loadLedgerFacts,
  type MasterCandidate,
} from '@/features/program/participantHooks'
import {
  isLedgerReady,
  ledgerGaps,
  type LedgerFill,
  type PersonField,
} from '@/features/program/participantPerson'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'
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
  /**
   * 가리키는 원장 행이 내려갔는가(비활성화·병합). **줄을 빼지 않고 표시만 한다** — 근거는
   * `LedgerFacts.retired` 주석에 있다.
   *
   * 원장을 읽지 못한 경우(권한·장애)는 여기 오지 않는다. 그때는 합성이 통째로 실패해 표가
   * 빈 화면 대신 오류를 말한다 — 못 읽은 것을 '내려갔다'로 적으면 화면이 거짓을 말한다.
   */
  retired: boolean
  /** 이 참가 사실을 가리키는 GUEST 명부 행이 있는가. 있으면 GUEST 연결을 먼저 거둬야 한다. */
  hasGuestLink: boolean
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

/**
 * 원장 새 행 하나의 페이로드 — **한 건 등록과 대용량이 같은 규칙을 쓴다.**
 *
 * 두 곳에 각각 적으면 한쪽만 고쳐지는 날이 오고, 그때 같은 파일이 어느 화면으로 올라갔느냐에
 * 따라 다른 행이 만들어진다.
 */
function ledgerPayload(
  master: MasterTable,
  input: { name: string; contactName: string; email: string; phone: string },
): Record<string, unknown> {
  const { ledger } = PARTICIPANT_PERSONAS[master]
  const trimmed = (v: string) => v.trim() || null

  const payload: Record<string, unknown> = {
    [ledger.person.name]: trimmed(input.contactName),
    [ledger.matchColumns.email]: trimmed(input.email),
    // 연락처는 숫자만 저장한다(등록 폼·업로드와 같은 규칙 — 표기 차이로 중복 판정이 갈린다).
    [ledger.matchColumns.phone]: input.phone.replace(/\D/g, '') || null,
    ...(ledger.createFixed ?? {}),
  }
  // 대상 이름을 **마지막에** 얹는다. NETWORKS는 대상이 곧 사람이라 이름 칸과 명의 칸이 같은
  // `name`인데, 앞에 두면 비어 있을 수 있는 명의가 필수인 이름을 덮어 지운다(그 자격의 폼과
  // 템플릿이 명의 칸을 세우지 않는 이유도 같다).
  payload[ledger.matchColumns.name] = input.name.trim()
  return payload
}

/** 이 사업의 참가자 명단 전부(자격 탭은 화면이 거른다). 뺀 줄은 오지 않는다. */
export function useProgramRoster(programId: string | undefined) {
  const config = useProgramWorkspace()
  return useQuery({
    queryKey: [config.key, 'roster', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<RosterRow[]> => {
      const [entriesResult, guestLinksResult] = await Promise.all([
        supabase
          .from(SHARED_TABLES.participantEntries)
          .select(ENTRY_COLS)
          .eq('entity_key', config.entityKey)
          .eq('program_id', programId)
          .is('deleted_at', null)
          .order('created_at', { ascending: true }),
        // 두 표는 soft reference라 FK embed가 없다. 같은 사업의 연결 키만 읽어 클라이언트에서
        // 합성한다. 이 조회가 실패하면 삭제 가능 여부를 거짓으로 만들지 않고 목록 전체를 막는다.
        supabase
          .from(SHARED_TABLES.participants)
          .select('master_table, master_id')
          .eq('entity_key', config.entityKey)
          .eq('program_id', programId)
          .not('master_table', 'is', null)
          .not('master_id', 'is', null),
      ])
      const { data, error } = entriesResult
      // 조회 실패를 삼키지 않는다 — 삼키면 "권한이 없다"와 "명단이 비었다"가 같은 화면이 된다.
      if (error) throw error
      if (guestLinksResult.error) throw guestLinksResult.error
      const rows = (data ?? []) as unknown as RawEntry[]
      const guestLinks = new Set(
        ((guestLinksResult.data ?? []) as {
          master_table: string | null
          master_id: string | null
        }[]).flatMap((r) =>
          r.master_table && r.master_id ? [`${r.master_table}:${r.master_id}`] : [],
        ),
      )

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
          retired: master?.retired ?? false,
          hasGuestLink: guestLinks.has(`${r.master_table}:${r.master_id}`),
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
 * 담기 전에 **원장의 빈 칸을 채운다**(2026-09-10 사용자 지정).
 *
 * 담당자가 명단 담기 창에서 적은 값이며, 원장이 이미 답한 칸은 애초에 입력이 서지 않아 여기
 * 오지 않는다 — 그래서 이 경로가 원장의 값을 덮어쓸 수 없다. 그 판정을 **쓰기 직전에 한 번 더**
 * 한다: 창이 열려 있던 사이 다른 사람이 그 칸을 채웠을 수 있고, 그때 이기는 쪽은 원장에 먼저
 * 앉은 값이어야 한다(창을 연 시점의 빈 칸 목록으로 쓰면 남의 값을 덮는다).
 *
 * **쓰고 나서 되읽는다.** PostgREST의 UPDATE는 RLS에 막혀 0행을 고쳐도 오류를 내지 않으므로,
 * 원장 쓰기 권한이 없는 담당자에게는 조용히 아무 일도 일어나지 않는다 — 그 침묵을 그대로 두면
 * 값이 없는 채로 명단에 담기고, 계정을 열 수 없는 줄이 다시 생긴다. 되읽어 아직 비어 있으면
 * **명단에는 아무것도 담지 않고** 멈춘다(순서를 원장 먼저로 둔 이유가 이것이다).
 */
async function fillLedger(master: MasterTable, fills: LedgerFill[]): Promise<void> {
  if (fills.length === 0) return
  const { ledger } = PARTICIPANT_PERSONAS[master]
  const ids = fills.map((f) => f.masterId)

  /** 지금 원장이 답하는 값. 창을 연 시점이 아니라 **쓰기 직전**의 사실이다. */
  const read = async () => {
    const { data, error } = await supabase.from(ledger.table).select(ledger.columns).in('id', ids)
    if (error) throw error
    const now = new Map<string, ReturnType<typeof ledger.map>>()
    for (const raw of (data ?? []) as unknown as Record<string, unknown>[]) {
      now.set(String(raw.id), ledger.map(raw))
    }
    return now
  }

  const before = await read()
  for (const fill of fills) {
    const facts = before.get(fill.masterId)
    if (!facts) continue
    const empty = new Set(ledgerGaps(facts))
    const payload: Record<string, unknown> = {}
    for (const [field, raw] of Object.entries(fill.values) as [PersonField, string][]) {
      // 담당자가 창을 열어 둔 사이 다른 사람이 그 칸을 채웠을 수 있다. 이기는 쪽은 원장에 먼저
      // 앉은 값이다 — 이 창은 비어 있던 자리를 메울 뿐 고치지 않는다.
      if (!empty.has(field)) continue
      // 연락처는 숫자만 저장한다(등록 폼·업로드와 같은 규칙 — 표기 차이로 중복 판정이 갈린다).
      const value = field === 'phone' ? raw.replace(/\D/g, '') : raw.trim()
      if (value) payload[ledger.person[field]] = value
    }
    if (Object.keys(payload).length === 0) continue
    const { error } = await supabase.from(ledger.table).update(payload).eq('id', fill.masterId)
    if (error) throw error
  }

  const after = await read()
  const stuck = [...after.values()].filter((facts) => !isLedgerReady(facts))
  if (stuck.length > 0) {
    throw new Error(
      `${stuck.map((f) => f.name).join(', ')} — 원장에 값을 쓰지 못했습니다. ` +
        '원장 수정 권한을 확인해 주세요(명단에는 담지 않았습니다).',
    )
  }
}

/**
 * 원장에서 고른 대상을 명단에 담는다. **계정은 세우지 않는다** — 참가자 목록은 참가 사실
 * 하나만 답하는 자리이고, 게스트 계정은 이 명단에서 **골라서** 만드는 다음 결정이다
 * (자동으로 세우면 담는 일과 문을 여는 일이 다시 한 동작이 된다).
 *
 * 다만 **원장의 빈 칸은 담기 직전에 채운다**(2026-09-10) — 명단에 담긴 대상은 계정을 열 수
 * 있어야 하고, 담당자가 그 값을 아는 자리는 이 창이다. 값을 쓰는 곳은 여전히 원장 하나이고,
 * 이 훅은 창에서 받은 것을 그리로 옮길 뿐이다.
 */
export function useAddRosterEntries(programId: string) {
  const config = useProgramWorkspace()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      master: MasterTable
      masterIds: string[]
      /** 원장이 비워 둔 칸에 채울 값. 담기 전에 원장에 반영된다. */
      fills: LedgerFill[]
    }): Promise<number> => {
      if (input.masterIds.length === 0) return 0
      await fillLedger(input.master, input.fills)
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
      // 원장을 고쳤을 수 있다 — 그 값을 읽는 목록(계정 생성 창의 후보)도 함께 상한다.
      void qc.invalidateQueries({ queryKey: [config.key, 'master-candidates'] })
    },
  })
}

/**
 * 원장에 새 행을 만들고 **그 자리에서 명단에 담는다**(2026-09-09).
 *
 * **명단에 직접 적는 칸을 만들지 않는 이유가 셋이다.** (1) 이 원장의 전제(*값을 복제하지
 * 않고 원장을 가리킨다*)가 그 순간 깨지고 표의 네 칸이 "원장 값인가 손으로 적은 값인가"를
 * 두 벌로 답해야 한다. (2) 가리킬 원장 행이 없는 줄은 **계정을 받을 수 없다** —
 * `guest_identities`의 키가 원장 행이라 발급이 성립하지 않고, 자료 참조·AI 작성도 전부
 * 원장 행을 전제한다. 담을 수는 있는데 아무것도 못 하는 줄이 생긴다. (3) 회의록 외부 참석자
 * 간이 등록이 같은 갈림길에서 이미 원장에 넣는 쪽을 골랐다.
 *
 * 받는 칸은 표에 서는 넷뿐이고 **넷 다 필수**다(2026-09-10) — 명단에 담긴 대상은 계정을
 * 열 수 있어야 하고, 그 값들이 없으면 열지 못한다. 이름 하나만 아는 대상은 명단이 아니라
 * 원장에서 먼저 만든다.
 *
 * 자격이 정하는 값(스타트업 구분 '미지정', NETWORKS 구분 '전문가')은 담당자가 고르지 않고
 * `ledger.createFixed`가 박는다.
 *
 * 두 쓰기를 트랜잭션으로 묶지 않는다 — PostgREST에 그 수단이 없다. 대신 순서를 원장 먼저로
 * 두어, 뒤가 실패해도 남는 것이 **명단에 담기지 않은 원장 행**이 된다(다시 담으면 그만이다).
 * 반대 순서였다면 가리킬 곳 없는 명단 줄이 남는다.
 */
export function useCreateLedgerEntry(programId: string) {
  const config = useProgramWorkspace()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      master: MasterTable
      name: string
      contactName: string
      email: string
      phone: string
    }): Promise<string> => {
      const { ledger } = PARTICIPANT_PERSONAS[input.master]
      const { data, error } = await supabase
        .from(ledger.table)
        .insert(ledgerPayload(input.master, input))
        .select('id')
        .single()
      if (error) throw error

      const masterId = String((data as { id: string }).id)
      const { error: linkError } = await supabase.from(SHARED_TABLES.participantEntries).insert({
        entity_key: config.entityKey,
        program_id: programId,
        master_table: input.master,
        master_id: masterId,
      })
      if (linkError) throw linkError
      return masterId
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [config.key, 'roster', programId] })
      void qc.invalidateQueries({ queryKey: [config.key, 'roster-candidates', programId] })
    },
  })
}

/**
 * 여러 건 담기 실행 — 대조에서 확정된 결정을 그대로 옮긴다(2026-09-09).
 *
 * 부르는 두 화면이 CSV파일 업로드와 신규 등록(여러 줄)이다(2026-09-10) — 목록을 파일이 정하느냐
 * 손이 정하느냐만 다르고, 대조 규칙도 실행도 같아야 하므로 훅은 하나다.
 *
 * **한 줄씩 등록 창을 여는 것과 결과가 같아야 한다.** 그래서 원장 신규는
 * `useCreateLedgerEntry`와 **같은 페이로드 조립**을 쓰고(자격이 정하는 값·이름을 마지막에
 * 얹는 규칙까지), 대조 판정은 등록 창과 같은 함수가 이미 끝내 화면에서 넘어온다.
 *
 * 순서는 원장 먼저다 — 뒤가 실패해도 남는 것이 '담기지 않은 원장 행'이지 '가리킬 곳 없는
 * 명단 줄'이 아니다. 원장 삽입은 한 번에 보내고(부분 성공을 만들지 않는다 — 절반만 만들어진
 * 상태에서 다시 실행하면 앞의 절반이 중복으로 걸린다), 명단 삽입도 한 번이다.
 */
export function useBulkAddRoster(programId: string) {
  const config = useProgramWorkspace()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      master: MasterTable
      /** 이미 원장에 있는 대상 — 그대로 담는다. */
      linkIds: string[]
      /** 원장에 없는 대상 — 만들어서 담는다. */
      creates: { name: string; contactName: string; email: string; phone: string }[]
    }): Promise<{ linked: number; created: number }> => {
      const { ledger } = PARTICIPANT_PERSONAS[input.master]
      const masterIds = [...input.linkIds]

      if (input.creates.length > 0) {
        const { data, error } = await supabase
          .from(ledger.table)
          .insert(input.creates.map((c) => ledgerPayload(input.master, c)))
          .select('id')
        if (error) throw error
        for (const row of (data ?? []) as { id: string }[]) masterIds.push(String(row.id))
      }

      if (masterIds.length > 0) {
        const { error } = await supabase.from(SHARED_TABLES.participantEntries).insert(
          masterIds.map((masterId) => ({
            entity_key: config.entityKey,
            program_id: programId,
            master_table: input.master,
            master_id: masterId,
          })),
        )
        if (error) throw error
      }
      return { linked: input.linkIds.length, created: input.creates.length }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [config.key, 'roster', programId] })
      void qc.invalidateQueries({ queryKey: [config.key, 'roster-candidates', programId] })
      void qc.invalidateQueries({ queryKey: [config.key, 'master-candidates'] })
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
