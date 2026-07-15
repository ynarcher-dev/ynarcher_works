import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { recordProgramContribution } from '@/features/ac/detail/programContributions'

/** 담당자 역할(program_manager_role enum). PM 복수 허용, 최소 1명 PM 필수. */
export type ProgramManagerRole = 'PM' | 'MEMBER'

/** 부서 역할(program_department_kind enum). 메인 1개 + 협업 n개. */
export type ProgramDepartmentKind = 'MAIN' | 'COLLAB'

/** 프로그램 부서 구성 1건(메인/협업 + 협업비율). 단계(org 버전) 그룹별 합 = 100. */
export interface ProgramDepartmentDraft {
  /** 소속 조직 버전(단계). 조직개편 경계마다 단계가 나뉜다. */
  org_version_id: string
  department_id: string
  kind: ProgramDepartmentKind
  /** 협업비율(정수 %). 단계 내 부서별 합 = 100. */
  collaboration_ratio: number
}

/** 부서 임베드(Draft + 부서명). */
export interface ProgramDepartment extends ProgramDepartmentDraft {
  department: { id: string; name: string } | null
}

/** 담당자 배치 구간 1건(단계·부서·역할·수행 기간·투입률). 저장 RPC 입력이자 임베드 조회 형태. */
export interface ProgramManagerDraft {
  user_id: string
  /** 소속 조직 버전(단계). 구간은 이 버전 유효기간 안에 있어야 한다. */
  org_version_id: string
  /** 소속 부서(해당 단계 지정 부서 중 하나). */
  department_id: string
  role: ProgramManagerRole
  /** 투입률(정수 %). 부서 내 담당자 합 = 그 부서 협업비율. */
  allocation_rate: number
  start_date: string
  end_date: string
}

/** 담당자 임베드(Draft + 사용자명·부서명). */
export interface ProgramManager extends ProgramManagerDraft {
  user: { id: string; name: string | null } | null
  department: { id: string; name: string } | null
}

export interface Program {
  id: string
  title: string
  status: string
  start_date: string | null
  end_date: string | null
  description: string | null
  updated_at: string | null
  /** 부서 구성(메인 1 + 협업 n, 협업비율 합 100). */
  departments: ProgramDepartment[]
  /** 담당자(program_managers 다대다 임베드). 등록자와 별개 축(재지정 가능). */
  managers: ProgramManager[]
  /** 등록자(created_by → users) FK 임베드. 목록 표준 컬럼(등록자)의 원천. */
  creator: { id: string; name: string | null } | null
}

const PROGRAM_COLS =
  'id, title, status, start_date, end_date, description, updated_at, ' +
  'departments:program_departments(org_version_id, department_id, kind, collaboration_ratio, department:departments!program_departments_department_id_fkey(id, name)), ' +
  'managers:program_managers(user_id, org_version_id, department_id, role, allocation_rate, start_date, end_date, user:users!program_managers_user_id_fkey(id, name), department:departments!program_managers_department_id_fkey(id, name)), ' +
  'creator:users!created_by(id, name)'

export function usePrograms() {
  return useQuery({
    queryKey: ['ac', 'programs'],
    queryFn: async (): Promise<Program[]> => {
      const { data, error } = await supabase
        .from('programs')
        .select(PROGRAM_COLS)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      // creator 임베드는 FK 힌트로 단일 객체가 오지만 타입 파서가 배열로 추론해 unknown 경유 캐스팅.
      return (data ?? []) as unknown as Program[]
    },
  })
}

export function useProgram(id: string | undefined) {
  return useQuery({
    queryKey: ['ac', 'program', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Program | null> => {
      const { data } = await supabase
        .from('programs')
        .select(PROGRAM_COLS)
        .eq('id', id)
        .maybeSingle()
      return (data as unknown as Program) ?? null
    },
  })
}

export function useCreateProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: {
      title: string
      status: string
      start_date?: string | null
      end_date?: string | null
      description?: string | null
    }): Promise<string> => {
      const { data, error } = await supabase
        .from('programs')
        .insert(values)
        .select('id')
        .single()
      if (error) throw error
      const id = (data as { id: string }).id
      // 변동 이력 최초 'created' 기록(부수 기록: 실패해도 등록은 성공 처리).
      await recordProgramContribution(id, 'created').catch(() => {})
      return id
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ['ac', 'programs'] })
      void qc.invalidateQueries({ queryKey: ['ac', 'contributions', id] })
    },
  })
}

/**
 * 프로그램 부서 구성 + 담당자 구간 원자적 전량 교체.
 * 부서 1메인·협업비율 합100, 부서별 일별 합=협업비율, PM≥1 검증은 서버 RPC set_program_staffing가 강제한다.
 * (직접 쓰기 정책은 없고 이 RPC가 유일한 쓰기 경로다.)
 */
export function useSetProgramStaffing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      programId,
      departments,
      managers,
    }: {
      programId: string
      departments: ProgramDepartmentDraft[]
      managers: ProgramManagerDraft[]
    }) => {
      const { error } = await supabase.rpc('set_program_staffing', {
        p_program_id: programId,
        p_departments: departments,
        p_managers: managers,
      })
      if (error) throw error
    },
    onSuccess: (_data, { programId }) => {
      void qc.invalidateQueries({ queryKey: ['ac', 'programs'] })
      void qc.invalidateQueries({ queryKey: ['ac', 'program', programId] })
    },
  })
}

export interface ProgramModule {
  id: string
  module_type: string
  enabled: boolean
  participation_mode: string | null
  /** DRAFT(준비)/OPEN(진행)/CLOSED(완료) — module_status enum. */
  status: string
  /** 모듈별 자유 설정(jsonb). 일정·메모는 detail/moduleMeta.ts 의 readModuleSettings 로 읽는다. */
  settings: Record<string, unknown>
}

export function useProgramModules(programId: string | undefined) {
  return useQuery({
    queryKey: ['ac', 'modules', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<ProgramModule[]> => {
      const { data } = await supabase
        .from('program_modules')
        .select('id, module_type, enabled, participation_mode, status, settings')
        .eq('program_id', programId)
      return (data ?? []) as ProgramModule[]
    },
  })
}

export function useToggleModule(programId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      moduleType: string
      enabled: boolean
      participationMode?: string | null
    }) => {
      const { error } = await supabase.from('program_modules').upsert(
        {
          program_id: programId,
          module_type: input.moduleType,
          enabled: input.enabled,
          participation_mode: input.participationMode ?? null,
          status: input.enabled ? 'OPEN' : 'CLOSED',
        },
        { onConflict: 'program_id,module_type' },
      )
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['ac', 'modules', programId] }),
  })
}

export interface MentoringRelationship {
  id: string
  startup_id: string | null
  mentor_participant_id: string | null
  status: string
}

/** 프로그램의 멘토링 관계 목록(MENTORING 모듈 기준). */
export function useMentoringRelationships(programId: string | undefined) {
  return useQuery({
    queryKey: ['ac', 'mentoring', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<MentoringRelationship[]> => {
      const { data: mod } = await supabase
        .from('program_modules')
        .select('id')
        .eq('program_id', programId)
        .eq('module_type', 'MENTORING')
        .maybeSingle()
      if (!mod) return []
      const { data } = await supabase
        .from('mentoring_relationships')
        .select('id, startup_id, mentor_participant_id, status')
        .eq('program_module_id', (mod as { id: string }).id)
      return (data ?? []) as MentoringRelationship[]
    },
  })
}

export interface Participant {
  id: string
  role: string
  status: string
  user_id: string | null
}

export function useParticipants(programId: string | undefined) {
  return useQuery({
    queryKey: ['ac', 'participants', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<Participant[]> => {
      const { data } = await supabase
        .from('program_participants')
        .select('id, role, status, user_id')
        .eq('program_id', programId)
        .order('role', { ascending: true })
      return (data ?? []) as Participant[]
    },
  })
}
