import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { sanitizeOrValue } from '@/features/master/ledgerPage'
import { useProgramWorkspace } from '@/features/program/workspace'

/**
 * 연동 DB(참가자 명부) 데이터 계층.
 *
 * 명부의 값은 원장(NETWORKS 기업·전문가)이 소유한다 — 여기서는 복제하지 않고 조회로 합성한다.
 * master_id는 FK가 아닌 soft ref라 임베드가 되지 않으므로, 명부를 읽은 뒤 원장을 한 번 더
 * 읽어 이름·연락처를 붙인다(useParticipantPool이 쓰던 방식과 같은 축).
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

/** 원장 출처. 내부 임직원 참가자는 원장이 없다(null). */
export type MasterTable = 'startups' | 'experts'

export interface ParticipantRow {
  id: string
  role: string
  master_table: MasterTable | null
  master_id: string | null
  user_id: string | null
  login_status: ParticipantLoginStatus
  /** 원장에서 온 대상 이름(기업명 또는 전문가명). 원장이 없으면 계정 이름. */
  targetName: string
  /** 부제(기업은 대표자, 전문가는 소속). */
  subtitle: string
  /** 로그인 주체의 성명(기업=대표자, 전문가=본인). 원장이 없으면 null. */
  loginName: string | null
  email: string | null
  phone: string | null
  /**
   * 원장이 이 대상을 무엇으로 분류하는가 — 기업은 STARTUP 구분(management_status),
   * 전문가는 원장 이름 자체다. 명부가 스스로 분류하지 않고 원장의 분류를 그대로 비춘다.
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
  /** 이미 이 사업에 같은 역할로 올라 있는가. */
  alreadyMapped: boolean
}

interface RawParticipant {
  id: string
  role: string
  master_table: MasterTable | null
  master_id: string | null
  user_id: string | null
  login_status: ParticipantLoginStatus
  user: { name: string | null; email: string | null } | null
}

/**
 * 명부 select. 계정 임베드에는 FK 힌트를 반드시 단다 — 명부에서 users로 가는 길이 둘이라
 * (`user_id` = 로그인 주체, `login_opened_by` = 문을 연 담당자) 힌트가 없으면 PostgREST가
 * 어느 쪽인지 판정하지 못하고 조회 전체를 거절한다(PGRST201). 제약 이름은 원장마다 다르므로
 * 물리 테이블명으로 조립한다(programCols가 임베드를 조립하는 것과 같은 축).
 */
function participantCols(table: string): string {
  return (
    'id, role, master_table, master_id, user_id, login_status, ' +
    `user:users!${table}_user_id_fkey(name, email)`
  )
}

interface StartupMaster {
  id: string
  name: string
  representative: string | null
  email: string | null
  phone: string | null
  /** 구분(management_status: sourced·incubated·invested·other). 원장이 분류하는 축. */
  management_status: string | null
}

interface ExpertMaster {
  id: string
  name: string
  affiliation: string | null
  email: string | null
  phone: string | null
}

/** 명부 전체(역할 탭은 화면이 거른다). 원장 값은 조회로 합성한다. */
export function useProgramParticipants(programId: string | undefined) {
  const config = useProgramWorkspace()
  return useQuery({
    queryKey: [config.key, 'participants', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<ParticipantRow[]> => {
      const { data, error } = await supabase
        .from(config.tables.participants)
        .select(participantCols(config.tables.participants))
        .eq('program_id', programId)
        .order('created_at', { ascending: true })
      // 조회 실패를 삼키지 않는다 — 삼키면 "권한이 없다"와 "명부가 비었다"가 같은 화면이 되고,
      // 실제로 임베드가 깨졌을 때 빈 목록만 남아 원인을 짚을 수 없다.
      if (error) throw error
      const rows = (data ?? []) as unknown as RawParticipant[]

      const startupIds = rows.filter((r) => r.master_table === 'startups' && r.master_id).map((r) => r.master_id!)
      const expertIds = rows.filter((r) => r.master_table === 'experts' && r.master_id).map((r) => r.master_id!)

      const [startupsRes, expertsRes] = await Promise.all([
        startupIds.length
          ? supabase.from('startups').select('id, name, representative, email, phone, management_status').in('id', startupIds)
          : Promise.resolve({ data: [] }),
        expertIds.length
          ? supabase.from('experts').select('id, name, affiliation, email, phone').in('id', expertIds)
          : Promise.resolve({ data: [] }),
      ])

      const startups = new Map(((startupsRes.data ?? []) as StartupMaster[]).map((s) => [s.id, s]))
      const experts = new Map(((expertsRes.data ?? []) as ExpertMaster[]).map((e) => [e.id, e]))

      return rows.map((r) => {
        const startup = r.master_table === 'startups' && r.master_id ? startups.get(r.master_id) : undefined
        const expert = r.master_table === 'experts' && r.master_id ? experts.get(r.master_id) : undefined
        // 연락처는 원장 화면이 쓰는 자리(email·phone 컬럼)에서만 읽는다. 옛 contact jsonb는
        // 어느 화면도 읽지 않는 레거시라, 그쪽을 보면 명부와 원장이 서로 다른 값을 말한다.
        const master = startup ?? expert
        return {
          id: r.id,
          role: r.role,
          master_table: r.master_table,
          master_id: r.master_id,
          user_id: r.user_id,
          login_status: r.login_status,
          targetName: master?.name ?? r.user?.name ?? '미지정',
          subtitle: startup?.representative ?? expert?.affiliation ?? '',
          loginName: startup?.representative ?? expert?.name ?? null,
          email: master?.email?.trim() || r.user?.email || null,
          phone: master?.phone?.trim() || null,
          masterCategory: startup?.management_status ?? null,
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
  role: string,
  search: string,
) {
  const config = useProgramWorkspace()
  const term = search.trim()
  return useQuery({
    queryKey: [config.key, 'master-candidates', programId, master, role, term],
    enabled: Boolean(programId),
    queryFn: async (): Promise<MasterCandidate[]> => {
      const base =
        master === 'startups'
          ? supabase.from('startups').select('id, name, representative, email, phone, management_status')
          : supabase.from('experts').select('id, name, affiliation, email, phone')

      let query = base.is('deleted_at', null).order('name', { ascending: true }).limit(50)
      const kw = sanitizeOrValue(term)
      if (kw) {
        query =
          master === 'startups'
            ? query.or(`name.ilike.%${kw}%,representative.ilike.%${kw}%`)
            : query.or(`name.ilike.%${kw}%,affiliation.ilike.%${kw}%`)
      }

      const [{ data, error }, mapped] = await Promise.all([
        query,
        supabase
          .from(config.tables.participants)
          .select('master_id')
          .eq('program_id', programId)
          .eq('master_table', master)
          .eq('role', role),
      ])
      if (error) throw error
      if (mapped.error) throw mapped.error

      const taken = new Set(
        ((mapped.data ?? []) as { master_id: string | null }[]).map((r) => r.master_id).filter(Boolean) as string[],
      )

      if (master === 'startups') {
        return ((data ?? []) as StartupMaster[]).map((s) => ({
          id: s.id,
          name: s.name,
          loginName: s.representative?.trim() || null,
          email: s.email?.trim() || null,
          phone: s.phone?.trim() || null,
          alreadyMapped: taken.has(s.id),
        }))
      }
      return ((data ?? []) as ExpertMaster[]).map((e) => ({
        id: e.id,
        name: e.name,
        loginName: e.name?.trim() || null,
        email: e.email?.trim() || null,
        phone: e.phone?.trim() || null,
        alreadyMapped: taken.has(e.id),
      }))
    },
  })
}

/**
 * 후보가 로그인 대상이 될 수 있는가.
 * 이메일과 연락처가 **둘 다** 있어야 한다 — 이메일은 ID이고 연락처는 초기 비밀번호라,
 * 한쪽만으로는 로그인이 성립하지 않는다(2026-08-27 비밀번호 인증 전환).
 */
export function canMapCandidate(c: MasterCandidate): boolean {
  return Boolean(c.loginName) && Boolean(c.email) && Boolean(c.phone)
}

/** 매핑 불가 사유(짧은 라벨). 가능하면 null. */
export function mapBlockReason(c: MasterCandidate): string | null {
  if (c.alreadyMapped) return '등록됨'
  if (!c.loginName) return '성명 없음'
  if (!c.email) return '이메일 없음'
  if (!c.phone) return '연락처 없음'
  return null
}

/** 원장에서 고른 대상을 명부에 올린다(로그인은 열리지 않는다). */
export function useAddParticipants(programId: string) {
  const config = useProgramWorkspace()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { master: MasterTable; role: string; ids: string[] }) => {
      const rows = input.ids.map((id) => ({
        program_id: programId,
        master_table: input.master,
        master_id: id,
        role: input.role,
      }))
      const { error } = await supabase.from(config.tables.participants).insert(rows)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [config.key, 'participants', programId] })
      void qc.invalidateQueries({ queryKey: [config.key, 'master-candidates', programId] })
    },
  })
}

export interface OpenAccessResult {
  opened: number
  notified: number
  failed: number
}

/**
 * 게스트 로그인 개방 + 접속 안내 발송. 인가(사업 담당자 여부)는 서버 RPC가 지며,
 * 함수는 그 결과로 받은 연락처로만 안내를 보낸다.
 */
export function useOpenGuestAccess(programId: string) {
  const config = useProgramWorkspace()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (participantIds: string[]): Promise<OpenAccessResult> => {
      const { data, error } = await supabase.functions.invoke<OpenAccessResult & { message?: string }>(
        'guest-access-invite',
        { body: { participantIds } },
      )
      if (error) throw new Error(data?.message ?? error.message)
      return { opened: data?.opened ?? 0, notified: data?.notified ?? 0, failed: data?.failed ?? 0 }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [config.key, 'participants', programId] })
    },
  })
}

/**
 * 게스트 비밀번호 초기화. 다시 원장의 연락처가 초기 비밀번호가 되고, 다음 로그인 때
 * 새 비밀번호를 정하게 된다(분실 대응).
 */
export function useResetGuestPassword(programId: string) {
  const config = useProgramWorkspace()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (participantIds: string[]): Promise<number> => {
      const { data, error } = await supabase.rpc('reset_program_guest_password', {
        p_participant_ids: participantIds,
      })
      if (error) throw error
      return (data as number | null) ?? 0
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [config.key, 'participants', programId] })
    },
  })
}

/** 게스트 로그인 차단(접속 중인 세션까지 즉시 무효화). */
export function useCloseGuestAccess(programId: string) {
  const config = useProgramWorkspace()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (participantIds: string[]): Promise<number> => {
      const { data, error } = await supabase.rpc('close_program_guest_access', {
        p_participant_ids: participantIds,
      })
      if (error) throw error
      return (data as number | null) ?? 0
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [config.key, 'participants', programId] })
    },
  })
}
