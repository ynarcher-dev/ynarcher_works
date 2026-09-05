import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useAuthStore } from '@/auth/authStore'
import { supabase } from '@/lib/supabase'
import {
  SHARED_TABLES,
  useProgramWorkspace,
  type ProgramWorkspaceConfig,
} from '@/features/program/workspace'

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
  /** 사업코드(6자리 영숫자 난수, 유니크). DB 트리거가 등록 시 자동 부여. */
  code: string | null
  /** 사업구분: PUBLIC(공공)/PRIVATE(민간)/REVENUE(매출)/NEW(신규)/ETC(기타). null=미지정. */
  category: string | null
  /**
   * 분야 태그(industry_tags 태그명 배열, 최대 3개). 이 사업이 발굴·대상으로 하는 분야이며,
   * 스타트업 원장의 industries와 같은 태그 원장을 읽는다. 미지정은 빈 배열.
   */
  industries: string[]
  /**
   * 주관(발주·주관하는 기관 또는 기업, 자유 서술). 운용 여부는 워크스페이스가 정한다
   * (ProgramWorkspaceConfig.hasHostOrganization — AC만 true). 미입력은 null.
   */
  host_organization: string | null
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
  /** 담당자(program_managers 다대다 임베드). 생성자와 별개 축(재지정 가능). */
  managers: ProgramManager[]
  /** 생성자(created_by → users) FK 임베드. 목록 표준 컬럼(생성자)의 원천. */
  creator: { id: string; name: string | null } | null
}

/**
 * 프로그램 임베드 select 문자열. 임베드 대상 테이블명과 FK 힌트(`<테이블>_<컬럼>_fkey`)가
 * 워크스페이스마다 다르므로 config의 물리 테이블명으로 조립한다.
 */
export function programCols(config: ProgramWorkspaceConfig): string {
  const { departments, managers } = config.tables
  return (
    // host_organization은 세 원장에 모두 있는 컬럼이라 select는 갈라지지 않는다 —
    // 표시·저장만 config(hasHostOrganization)가 가른다.
    'id, code, category, industries, host_organization, title, status, proposal_start_date, proposal_end_date, start_date, end_date, description, updated_at, ' +
    `departments:${departments}(org_version_id, department_id, kind, collaboration_ratio, department:departments!${departments}_department_id_fkey(id, name)), ` +
    `managers:${managers}(user_id, org_version_id, department_id, role, allocation_rate, start_date, end_date, user:users!${managers}_user_id_fkey(id, name), department:departments!${managers}_department_id_fkey(id, name)), ` +
    'creator:users!created_by(id, name)'
  )
}

/**
 * 분야 태그 목록을 읽는다. 원장 컬럼은 jsonb라 스키마상 배열이 보장되지 않으므로
 * (컬럼이 없던 시절의 캐시·다른 select로 받은 행) 배열이 아닌 값은 빈 목록으로 흡수한다.
 */
export function programIndustries(program: Pick<Program, 'industries'> | null | undefined): string[] {
  const raw: unknown = program?.industries
  return Array.isArray(raw) ? raw.map((v) => String(v).trim()).filter(Boolean) : []
}

export function useProgram(id: string | undefined) {
  const config = useProgramWorkspace()
  return useQuery({
    queryKey: [config.key, 'program', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Program | null> => {
      const { data } = await supabase
        .from(config.tables.programs)
        .select(programCols(config))
        .eq('id', id)
        .maybeSingle()
      return (data as unknown as Program) ?? null
    },
  })
}

export function useCreateProgram() {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  return useMutation({
    mutationFn: async (values: {
      title: string
      status: string
      proposal_start_date?: string | null
      proposal_end_date?: string | null
      start_date?: string | null
      end_date?: string | null
      description?: string | null
      category?: string | null
      industries?: string[]
      /** 주관. 운용하지 않는 워크스페이스는 키 자체를 보내지 않는다. */
      host_organization?: string | null
    }): Promise<string> => {
      const { data, error } = await supabase
        .from(config.tables.programs)
        .insert(values)
        .select('id')
        .single()
      if (error) throw error
      // 변동 이력 'created'는 원장 트리거가 같은 트랜잭션에서 남긴다(20260721140000).
      return (data as { id: string }).id
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: [config.key, 'programs'] })
      void qc.invalidateQueries({ queryKey: [config.key, 'contributions', id] })
    },
  })
}

/**
 * 프로그램 부서 구성 + 담당자 구간 원자적 전량 교체.
 * 부서 1메인·협업비율 합100, 부서별 일별 합=협업비율, PM≥1 검증은 서버 배치 RPC가 강제한다.
 * (직접 쓰기 정책은 없고 이 RPC가 유일한 쓰기 경로다.)
 */
export function useSetProgramStaffing() {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
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
      const { error } = await supabase.rpc(config.rpcs.setStaffing, {
        p_program_id: programId,
        p_departments: departments,
        p_managers: managers,
      })
      if (error) throw error
    },
    onSuccess: (_data, { programId }) => {
      void qc.invalidateQueries({ queryKey: [config.key, 'programs'] })
      void qc.invalidateQueries({ queryKey: [config.key, 'program', programId] })
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

/**
 * 모듈 임베드 select 문자열. 담당자 원장이 통합된 뒤로 워크스페이스별로 갈릴 것이 없어
 * 인자를 받지 않는다 — 갈리지 않는 값을 인자로 받으면 호출부가 "여기 뭔가 다를 수 있다"고
 * 읽는다.
 */
export function moduleCols(): string {
  const t = SHARED_TABLES.moduleAssignees
  return (
    'id, module_type, title, enabled, participation_mode, visibility, status, settings, ' +
    `assignees:${t}(user_id, user:users!${t}_user_id_fkey(id, name))`
  )
}

export function useProgramModules(programId: string | undefined) {
  const config = useProgramWorkspace()
  return useQuery({
    queryKey: [config.key, 'modules', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<ProgramModule[]> => {
      const { data } = await supabase
        .from(SHARED_TABLES.modules)
        .select(moduleCols())
        .eq('program_id', programId)
      return (data ?? []) as unknown as ProgramModule[]
    },
  })
}

/** 인스턴스 끄기/켜기(soft off). enabled 플래그만 부분 업데이트한다. */
export function useToggleModule(programId: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  return useMutation({
    mutationFn: async (input: { moduleId: string; enabled: boolean }) => {
      const { error } = await supabase
        .from(SHARED_TABLES.modules)
        .update({ enabled: input.enabled })
        .eq('id', input.moduleId)
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [config.key, 'modules', programId] }),
  })
}

/**
 * 운영 모듈 인스턴스 생성/수정 + 담당자 전량 교체(원자). 유일한 쓰기 경로는 공용 RPC `set_program_module`이며,
 * 소유 원장은 p_entity_key가 정한다. 모듈명 유일·담당자 풀 소속·OUTCOMES 단일·기간 포함·템플릿
 * 카탈로그 허용을 서버에서 강제한다. 생성된 인스턴스 id를 반환한다.
 */
export function useSetProgramModule(programId: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
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
        p_entity_key: config.entityKey,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: [config.key, 'modules', programId] }),
  })
}

/**
 * 이 사업의 PM인지 여부. 모듈 삭제 한 가지에만 쓰는 판정이라 담당자 전체를 끌어오지 않고
 * 본인 행만 확인한다(RLS가 이미 사업 범위를 좁히므로 결과는 항상 본인 것이다).
 *
 * 화면에서 감추는 것은 보안이 아니다 — 실제 차단은 delete_program_module RPC가 한다.
 * 이 훅은 누를 수 없는 버튼을 보여 주지 않기 위한 것뿐이다.
 */
export function useIsProgramPm(programId: string | undefined) {
  const config = useProgramWorkspace()
  const userId = useAuthStore((s) => s.user?.id)
  return useQuery({
    queryKey: [config.key, 'is-pm', programId, userId],
    enabled: Boolean(programId && userId),
    queryFn: async (): Promise<boolean> => {
      const { data } = await supabase
        .from(config.tables.managers)
        .select('id')
        .eq('program_id', programId)
        .eq('user_id', userId)
        .eq('role', 'PM')
        .limit(1)
      return (data ?? []).length > 0
    },
  })
}

/**
 * 모듈 삭제 시 남아 있는 데이터 1줄. 한글 라벨은 화면이 붙인다.
 *
 * `blocking`이 두 목록을 가른다 — 참이면 밖에서 들어온 기록이라 삭제를 막고, 거짓이면
 * 모듈과 함께 사라지므로 막지 않고 알리기만 한다. 막지 않는 것과 말없이 지우는 것은
 * 다르다는 것이 이 필드가 있는 이유다.
 */
export interface ModuleDeleteBlocker {
  rel_name: string
  row_count: number
  blocking: boolean
}

/**
 * 삭제 전 잔존 데이터. 삭제창을 열 때 미리 불러 '왜 못 지우는지'와 '무엇이 함께 사라지는지'를
 * 버튼을 누르기 전에 보여 준다 — 눌러 본 뒤에 실패로 알려 주면 되돌릴 수 없는 작업 앞에서
 * 사용자가 한 번 더 시도한다.
 */
export function useModuleDeleteBlockers(moduleId: string | undefined) {
  const config = useProgramWorkspace()
  return useQuery({
    queryKey: [config.key, 'module-delete-blockers', moduleId],
    enabled: Boolean(moduleId),
    queryFn: async (): Promise<ModuleDeleteBlocker[]> => {
      const { data, error } = await supabase.rpc('program_module_delete_blockers', {
        p_entity_key: config.entityKey,
        p_module_id: moduleId,
      })
      if (error) throw error
      return (data ?? []) as ModuleDeleteBlocker[]
    },
  })
}

/**
 * 모듈 인스턴스 물리 삭제(PM 전용). 끄기(useToggleModule)와 다른 축이다 — 끄기는 되돌릴 수
 * 있는 운영 중단이고 이쪽은 원장에서 사라진다. 확인 문구·PM·잔존 데이터는 모두 서버가 판정한다.
 */
export function useDeleteProgramModule(programId: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  return useMutation({
    mutationFn: async (input: { moduleId: string; confirmText: string }) => {
      const { error } = await supabase.rpc('delete_program_module', {
        p_entity_key: config.entityKey,
        p_module_id: input.moduleId,
        p_confirm_text: input.confirmText,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [config.key, 'modules', programId] }),
  })
}
