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
  /** 제안 단계 기간(제안서 작성~발표). 제안 없이 시작한 프로그램은 null. */
  proposal_start_date: string | null
  proposal_end_date: string | null
  /** 운영 기간(실제 행사 관리 기간). */
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
  'id, title, status, proposal_start_date, proposal_end_date, start_date, end_date, description, updated_at, ' +
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
      proposal_start_date?: string | null
      proposal_end_date?: string | null
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

/** 모듈 인스턴스 담당자(program_module_assignees 임베드). 이름은 users 조인. */
export interface ModuleAssignee {
  user_id: string
  user: { id: string; name: string | null } | null
}

export interface ProgramModule {
  id: string
  module_type: string
  /** 모듈명(자율 입력). 미입력 시 UI에서 템플릿 라벨로 폴백한다. */
  title: string | null
  enabled: boolean
  /** 배정 방식(participation_mode). 모듈 타입별 기본값으로 강제, 매칭만 선택형. */
  participation_mode: string | null
  /** 공유 범위(module_visibility): INTERNAL_ONLY/GUEST_ONLY/PUBLIC. */
  visibility: string
  /** DRAFT(준비)/OPEN(진행)/CLOSED(완료)/CANCELLED(취소) — module_status enum. */
  status: string
  /** 모듈별 자유 설정(jsonb). 일정·메모는 detail/moduleMeta.ts 의 readModuleSettings 로 읽는다. */
  settings: Record<string, unknown>
  /** 담당자(다중). 프로그램 담당자 풀에서 선택된 임직원. */
  assignees: ModuleAssignee[]
}

const MODULE_COLS =
  'id, module_type, title, enabled, participation_mode, visibility, status, settings, ' +
  'assignees:program_module_assignees(user_id, user:users!program_module_assignees_user_id_fkey(id, name))'

export function useProgramModules(programId: string | undefined) {
  return useQuery({
    queryKey: ['ac', 'modules', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<ProgramModule[]> => {
      const { data } = await supabase
        .from('program_modules')
        .select(MODULE_COLS)
        .eq('program_id', programId)
      return (data ?? []) as unknown as ProgramModule[]
    },
  })
}

/** 인스턴스 끄기/켜기(soft off). enabled 플래그만 부분 업데이트한다. */
export function useToggleModule(programId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { moduleId: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('program_modules')
        .update({ enabled: input.enabled })
        .eq('id', input.moduleId)
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['ac', 'modules', programId] }),
  })
}

/**
 * 운영 모듈 인스턴스 생성/수정 + 담당자 전량 교체(원자). 유일한 쓰기 경로는 set_program_module RPC이며,
 * 모듈명 유일·담당자 풀 소속·OUTCOMES 단일·기간 포함 검증을 서버에서 강제한다. 생성된 인스턴스 id를 반환한다.
 */
export function useSetProgramModule(programId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      /** 신규 생성이면 null, 수정이면 대상 인스턴스 id. */
      moduleId: string | null
      moduleType: string
      title: string | null
      status: string
      visibility: string
      /** 매칭만 선택형. 그 외는 null로 보내면 서버가 템플릿 기본값으로 강제한다. */
      participationMode: string | null
      settings: Record<string, unknown>
      assigneeUserIds: string[]
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('set_program_module', {
        p_program_id: programId,
        p_module_id: input.moduleId,
        p_module_type: input.moduleType,
        p_title: input.title,
        p_status: input.status,
        p_visibility: input.visibility,
        p_participation_mode: input.participationMode,
        p_settings: input.settings,
        p_assignee_user_ids: input.assigneeUserIds,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ac', 'modules', programId] }),
  })
}

export interface MentoringRelationship {
  id: string
  startup_id: string | null
  mentor_participant_id: string | null
  status: string
}

/** 프로그램의 멘토링 관계 목록(MENTORING 모듈 기준). */
/** 멘토링 관계(특정 멘토링 인스턴스 단위). moduleId = program_modules.id. */
export function useMentoringRelationships(moduleId: string | undefined) {
  return useQuery({
    queryKey: ['ac', 'mentoring', moduleId],
    enabled: Boolean(moduleId),
    queryFn: async (): Promise<MentoringRelationship[]> => {
      const { data } = await supabase
        .from('mentoring_relationships')
        .select('id, startup_id, mentor_participant_id, status')
        .eq('program_module_id', moduleId)
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
