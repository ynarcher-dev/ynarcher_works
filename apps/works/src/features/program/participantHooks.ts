import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { sanitizeOrValue } from '@/features/master/ledgerPage'
import type { PersonChoice } from '@/features/program/participantPerson'
import {
  PARTICIPANT_PERSONAS,
  isMasterTable,
  type LedgerFacts,
  type MasterTable,
} from '@/features/program/participantPersona'
import { SHARED_TABLES, useProgramWorkspace } from '@/features/program/workspace'

/**
 * 참가자 명부(참여 기업·참여 전문가) 데이터 계층.
 *
 * 명부의 값은 원장이 소유한다 — 여기서는 복제하지 않고 조회로 합성한다. master_id는 FK가 아닌
 * soft ref라 임베드가 되지 않으므로, 명부를 읽은 뒤 원장을 한 번 더 읽어 이름·연락처를 붙인다.
 *
 * **어느 원장을 어떻게 읽는지는 이 파일이 알지 않는다** — 자격 설정(`PARTICIPANT_PERSONAS`)이
 * 표 이름·컬럼·좁히는 조건·읽는 방법을 함께 갖고, 여기서는 명부 행에 적힌 자격으로 그것을
 * 꺼내 쓴다. 그래서 자격을 하나 더 여는 일에 이 파일은 손대지 않는다.
 *
 * 근거: docs/docs_planning/3_4_4_ac_participant_pool.md
 */

/** 명부 행의 게스트 로그인 개방 상태(participant_login_status). */
export type ParticipantLoginStatus =
  | 'NOT_APPLICABLE'
  | 'NOT_ALLOWED'
  | 'INVITED'
  | 'ACTIVE'
  | 'BLOCKED'

export type { MasterTable }

export interface ParticipantRow {
  id: string
  master_table: MasterTable | null
  master_id: string | null
  user_id: string | null
  login_status: ParticipantLoginStatus
  /**
   * 이 대상에게 게스트 계정이 이미 있는가. 계정의 키가 원장 행이라 명부 행만으로 판정할 수
   * 있으므로, 담당자가 계정 발급 화면을 확인하러 갈 필요가 없다.
   */
  hasAccount: boolean
  /** 그 계정의 id(재설정 안내 발송 대상). 계정이 없으면 null. */
  accountId: string | null
  /** 그 계정의 마지막 접속 시각. 아직 한 번도 없으면 null. */
  lastLoginAt: string | null
  /**
   * 이 줄을 명부에 담은 사람. 어떤 권한도 주지 않는 서술 값이며 트리거가 찍는다 —
   * 관리 주체는 사업 담당자이고, 이 값은 "누가 담았나"에만 답한다.
   *
   * 컬럼은 2026-09-05에 생겼다(20260905180000). 그 전에 담긴 줄은 알 수 없어 비어 있고,
   * 지어내지 않고 그대로 비운다 — 없는 사실을 채우면 그 화면이 거짓을 말한다.
   */
  createdByName: string | null
  /** 원장에서 온 대상 이름(기업명 또는 전문가명). 원장이 없으면 계정 이름. */
  targetName: string
  /** 부제(기업은 대표자, 전문가는 소속). */
  subtitle: string
  /** 로그인 주체의 성명(기업=대표자, 전문가=본인). 원장이 없으면 null. */
  loginName: string | null
  email: string | null
  phone: string | null
  /**
   * 원장이 이 대상을 무엇으로 분류하는가. 명부가 스스로 분류하지 않고 원장의 분류를 그대로
   * 비춘다 — 라벨·톤 매핑은 자격 설정의 `categoryBadge`가 갖는다.
   */
  masterCategory: string | null
}

/** 원장에서 고를 수 있는 후보 1건. */
export interface MasterCandidate {
  id: string
  name: string
  /** 로그인 명의(기업=대표자, 전문가=본인 이름). 없으면 매핑 불가. */
  loginName: string | null
  email: string | null
  phone: string | null
  /** 이미 이 사업에 같은 자격으로 올라 있는가. */
  alreadyMapped: boolean
}

interface RawParticipant {
  id: string
  master_table: string | null
  master_id: string | null
  user_id: string | null
  login_status: ParticipantLoginStatus
  user: { name: string | null; email: string | null } | null
  creator: { name: string | null } | null
}

/**
 * 명부 select. 계정 임베드에는 FK 힌트를 반드시 단다 — 명부에서 users로 가는 길이 셋이라
 * (`user_id` = 로그인 주체, `login_opened_by` = 문을 연 담당자, `created_by` = 명부에 담은
 * 사람) 힌트가 없으면 PostgREST가 어느 쪽인지 판정하지 못하고 조회 전체를 거절한다
 * (PGRST201). 제약 이름은 원장마다 다르므로 물리 테이블명으로 조립한다(programCols가
 * 임베드를 조립하는 것과 같은 축).
 */
function participantCols(table: string): string {
  return (
    'id, master_table, master_id, user_id, login_status, ' +
    `user:users!${table}_user_id_fkey(name, email), ` +
    `creator:users!${table}_created_by_fkey(name)`
  )
}

/**
 * 명부 행이 가리키는 원장 행을 자격별로 한 번씩 읽어 `자격:id → 사실`로 세운다.
 *
 * 자격 수만큼 병렬 조회가 돌고, 자격이 늘어도 이 함수는 그대로다 — 어느 표를 어떤 컬럼으로
 * 읽는지는 자격 설정이 답한다.
 */
async function loadLedgerFacts(
  rows: { master_table: string | null; master_id: string | null }[],
): Promise<Map<string, LedgerFacts>> {
  const byPersona = new Map<MasterTable, string[]>()
  for (const row of rows) {
    if (!isMasterTable(row.master_table) || !row.master_id) continue
    const ids = byPersona.get(row.master_table) ?? []
    ids.push(row.master_id)
    byPersona.set(row.master_table, ids)
  }

  const facts = new Map<string, LedgerFacts>()
  await Promise.all(
    [...byPersona].map(async ([key, ids]) => {
      const { ledger } = PARTICIPANT_PERSONAS[key]
      const { data } = await supabase.from(ledger.table).select(ledger.columns).in('id', ids)
      for (const raw of (data ?? []) as unknown as Record<string, unknown>[]) {
        facts.set(`${key}:${String(raw.id)}`, ledger.map(raw))
      }
    }),
  )
  return facts
}

/** 명부 전체(자격 탭은 화면이 거른다). 원장 값은 조회로 합성한다. */
export function useProgramParticipants(programId: string | undefined) {
  const config = useProgramWorkspace()
  return useQuery({
    queryKey: [config.key, 'participants', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<ParticipantRow[]> => {
      const { data, error } = await supabase
        .from(SHARED_TABLES.participants)
        .select(participantCols(SHARED_TABLES.participants))
        .eq('program_id', programId)
        .order('created_at', { ascending: true })
      // 조회 실패를 삼키지 않는다 — 삼키면 "권한이 없다"와 "명부가 비었다"가 같은 화면이 되고,
      // 실제로 임베드가 깨졌을 때 빈 목록만 남아 원인을 짚을 수 없다.
      if (error) throw error
      const rows = (data ?? []) as unknown as RawParticipant[]

      const facts = await loadLedgerFacts(rows)

      // 계정 유무는 명부 행이 아니라 **원장 행**이 답한다(인격 매핑이 그것을 들고 있다).
      // 그래서 아직 이 사업에 문을 열지 않은 대상도 "계정 있음"으로 뜬다 — 담당자가
      // 신규인지 기존인지 구분할 필요 없이 `연결` 하나만 누르면 되는 근거가 여기다.
      // 한 계정이 여러 인격을 가질 수 있으므로(참여 기업 + 참여 전문가) 계정이 아니라
      // 매핑표를 읽는다.
      const masterIds = rows.map((r) => r.master_id).filter(Boolean) as string[]
      const accountsRes = masterIds.length
        ? await supabase
            .from('guest_identities')
            .select('master_table, master_id, user_id')
            .in('master_id', masterIds)
        : { data: [] }
      // **원장 행에 계정이 있는가**만 답하는 집합이다(2026-09-08). 종전에는
      // `원장행 → 계정id` 지도였는데, 한 원장 행이 계정 여럿을 가질 수 있게 되면서
      // (3_9_2 §5) 그 지도는 임의의 한 명을 답하게 됐다. "이 참여자의 계정"은 지도가
      // 아니라 명부 행의 `user_id`가 답한다 — 문을 열 때 그 사람으로 박히기 때문이다.
      const ledgerHasAccount = new Set(
        ((accountsRes.data ?? []) as {
          master_table: string
          master_id: string
          user_id: string
        }[]).map((g) => `${g.master_table}:${g.master_id}`),
      )

      const accountIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean) as string[])]
      // 마지막 접속은 초대 레코드가 갖는다(사업마다 한 건). 계정 단위로 최댓값을 취한다.
      const usedRes = accountIds.length
        ? await supabase
            .from('guest_invitations')
            .select('app_user_id, used_at')
            .in('app_user_id', accountIds)
        : { data: [] }
      const lastLogin = new Map<string, string>()
      for (const row of (usedRes.data ?? []) as { app_user_id: string; used_at: string | null }[]) {
        if (!row.used_at) continue
        const prev = lastLogin.get(row.app_user_id)
        if (!prev || prev < row.used_at) lastLogin.set(row.app_user_id, row.used_at)
      }

      return rows.map((r) => {
        const persona = isMasterTable(r.master_table) ? r.master_table : null
        const key = persona && r.master_id ? `${persona}:${r.master_id}` : null
        const master = key ? facts.get(key) : undefined
        // 이 참여자의 계정은 명부 행이 답한다. 원장 행에 다른 사람의 계정이 있어도
        // 그것은 이 줄의 계정이 아니다(1:N 전환 이후 갈리는 자리다).
        const accountId = r.user_id ?? null
        // 반면 "계정 있음" 표시는 원장 행 기준이다 — 아직 문을 열지 않은 대상도 그렇게
        // 떠야 담당자가 신규인지 기존인지 구분하지 않고 `로그인 열기` 하나만 누르면 된다.
        const hasAccount = Boolean(accountId) || Boolean(key && ledgerHasAccount.has(key))
        return {
          id: r.id,
          master_table: persona,
          master_id: r.master_id,
          user_id: r.user_id,
          login_status: r.login_status,
          hasAccount,
          accountId,
          lastLoginAt: accountId ? (lastLogin.get(accountId) ?? null) : null,
          createdByName: r.creator?.name ?? null,
          targetName: master?.name || r.user?.name || '미지정',
          subtitle: master?.subtitle ?? '',
          loginName: master?.loginName ?? null,
          email: master?.email ?? r.user?.email ?? null,
          phone: master?.phone ?? null,
          masterCategory: master?.category ?? null,
        }
      })
    },
  })
}

/**
 * 원장 후보 검색(매핑 모달). 성명·연락처가 없는 대상도 함께 돌려주고 화면이 사유를 표시한다 —
 * 목록에서 빼 버리면 "왜 안 보이지"가 되고, 보이되 고를 수 없어야 "무엇을 보완해야 하는지"가 남는다.
 */
export function useMasterCandidates(
  programId: string | undefined,
  master: MasterTable,
  search: string,
) {
  const config = useProgramWorkspace()
  const term = search.trim()
  return useQuery({
    queryKey: [config.key, 'master-candidates', programId, master, term],
    enabled: Boolean(programId),
    queryFn: async (): Promise<MasterCandidate[]> => {
      const { ledger } = PARTICIPANT_PERSONAS[master]
      let query = supabase
        .from(ledger.table)
        .select(ledger.columns)
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .limit(50)
      if (ledger.narrow) query = query.eq(ledger.narrow.column, ledger.narrow.value)
      const kw = sanitizeOrValue(term)
      if (kw) query = query.or(ledger.searchColumns.map((c) => `${c}.ilike.%${kw}%`).join(','))

      const [{ data, error }, mapped] = await Promise.all([
        query,
        supabase
          .from(SHARED_TABLES.participants)
          .select('master_id')
          .eq('program_id', programId)
          .eq('master_table', master),
      ])
      if (error) throw error
      if (mapped.error) throw mapped.error

      const taken = new Set(
        ((mapped.data ?? []) as { master_id: string | null }[])
          .map((r) => r.master_id)
          .filter(Boolean) as string[],
      )

      return ((data ?? []) as unknown as Record<string, unknown>[]).map((raw) => {
        const facts = ledger.map(raw)
        const id = String(raw.id)
        return {
          id,
          name: facts.name,
          loginName: facts.loginName,
          email: facts.email,
          phone: facts.phone,
          alreadyMapped: taken.has(id),
        }
      })
    },
  })
}

/**
 * 매핑 불가 사유(짧은 라벨). 가능하면 null.
 *
 * **막는 것은 '이미 담김' 하나다**(2026-09-08). 종전에는 원장에 성명·이메일·연락처가 없으면
 * 고를 수 없었고, 그것은 계정 값을 **원장이 정하던** 시절의 규칙이었다 — 원장이 비면 계정을
 * 세울 방법이 아예 없었으므로 목록에서 미리 잠그는 것이 정직했다.
 *
 * 지금은 담당자가 2단계에서 이름·이메일·연락처를 적는다. 그래서 원장이 비었다는 것은 더 이상
 * '담을 수 없다'가 아니라 '기본값이 비어 있다'이며, 그 사실은 줄 아래 회색 한 줄이 답한다.
 */
export function mapBlockReason(c: MasterCandidate): string | null {
  return c.alreadyMapped ? '등록됨' : null
}

export interface AddParticipantsResult {
  added: number
  /** 계정을 세우지 못한 줄의 사유. 나머지는 담긴다 — 하나가 막혔다고 나머지를 버리지 않는다. */
  failed: string[]
}

/**
 * 원장에서 고른 대상을 **사람까지 정해** 명부에 올린다. 로그인은 아직 열리지 않는다.
 *
 * 명부에 담는 일과 문을 여는 일은 갈려 있다 — 참여 후보를 쌓아 두더라도 확정 전에는 문이
 * 열리지 않고, 여는 것은 그 사업 담당자(PM·MEMBER)뿐이다.
 *
 * **계정은 여기서 세워진다**(2026-09-08 사용자 지정). 종전에는 `로그인 열기`가 원장 행에서
 * 한 명을 자동으로 꺼내 세웠고, 그래서 한 회사에 담당자를 여럿 둘 수 없었다. 담을 때 정하면
 * 명부 행이 처음부터 "어느 회사의 누구"를 들고, 개방은 그 값을 쓴다(20260908210000).
 *
 * **삽입 전에 계정을 세운다.** 순서를 뒤집어 명부 행을 먼저 넣으면, 발급이 실패했을 때
 * 사람 없는 줄이 남아 담당자가 그것을 지우고 다시 담아야 한다.
 *
 * 발급은 멱등이라 같은 이메일이 이미 있으면 그 계정을 그대로 돌려받는다 — 그래서 같은
 * 사람을 두 번째 사업에 담아도 계정도 비밀번호도 늘지 않는다.
 */
export function useAddParticipants(programId: string) {
  const config = useProgramWorkspace()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      master: MasterTable
      rows: { masterId: string; choice: PersonChoice }[]
    }): Promise<AddParticipantsResult> => {
      const failed: string[] = []
      const resolved: { masterId: string; userId: string }[] = []

      for (const row of input.rows) {
        if (row.choice.kind === 'existing') {
          resolved.push({ masterId: row.masterId, userId: row.choice.userId })
          continue
        }
        const { data, error } = await supabase.rpc('issue_guest_account', {
          p_master_table: input.master,
          p_master_id: row.masterId,
          p_name: row.choice.name.trim() || null,
          p_email: row.choice.email.trim() || null,
          p_phone: row.choice.phone.trim() || null,
        })
        // 사유를 그대로 옮긴다 — 서버가 "연락처가 없어 계정을 세울 수 없습니다"처럼 무엇을
        // 보완해야 하는지 답하는데, 여기서 뭉뚱그리면 담당자가 그 답을 잃는다.
        if (error) failed.push(`${row.choice.name || row.masterId}: ${error.message}`)
        else resolved.push({ masterId: row.masterId, userId: data as string })
      }

      if (resolved.length > 0) {
        const { error } = await supabase.from(SHARED_TABLES.participants).insert(
          resolved.map((r) => ({
            entity_key: config.entityKey,
            program_id: programId,
            master_table: input.master,
            master_id: r.masterId,
            user_id: r.userId,
          })),
        )
        if (error) throw error
      }
      return { added: resolved.length, failed }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [config.key, 'participants', programId] })
      void qc.invalidateQueries({ queryKey: [config.key, 'master-candidates', programId] })
      // 계정을 세웠으므로 창구의 목록과 원장 행별 계정 수도 함께 상한다.
      void qc.invalidateQueries({ queryKey: ['admin', 'guest-accounts'] })
      void qc.invalidateQueries({ queryKey: ['admin', 'guest-ledger-accounts'] })
    },
  })
}
