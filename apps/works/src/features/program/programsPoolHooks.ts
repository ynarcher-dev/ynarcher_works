import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  NO_MATCH_ID,
  countLedgerRows,
  fetchLedgerPage,
  managedRecordIds,
  sanitizeOrValue,
  userIdsByName,
  type LedgerCondition,
  type LedgerPage,
} from '@/features/master/ledgerPage'
import { programStatusOptions } from '@/features/program/config'
import type { Program } from '@/features/program/hooks'
import {
  useProgramWorkspace,
  type ProgramWorkspaceConfig,
} from '@/features/program/workspace'

/**
 * 프로그램 목록 복수 필터. 빈 배열/빈 문자열은 "미적용"이다.
 * 상태는 scalar(in), 시작일은 범위로 건다.
 */
export interface ProgramFilters {
  /** 상태(program_status). 대기/진행중/종료/취소. */
  statuses: string[]
  /**
   * 사업구분(category). 값은 워크스페이스 config.categories의 코드이며,
   * 미분류(category is null)는 UNCLASSIFIED 표식으로 함께 고른다 — 종전에 사이드바 '기타'가
   * includeUnclassified로 떠맡던 역할이 여기로 옮겨 왔다(2026-08-03 세분화 메뉴 폐지).
   */
  categories: string[]
  /**
   * 담당 부서 계보 id(departments.lineage_id). 메인/협업을 가리지 않고 걸린다 —
   * 목록 표기에서 '외 N'으로 접힌 협업 부서로도 사업을 찾을 수 있어야 한다.
   * 부서 id가 아니라 계보 id인 이유: 부서 id는 조직 버전마다 새로 발급되므로, id로 거르면
   * 개편 전 단계에 같은 부서를 지정한 사업이 통째로 빠진다.
   */
  departmentLineages: string[]
  /**
   * 운영 시작일(start_date) 하한. '' = 미적용.
   * 종전에는 이 축 하나에 부터~까지 두 칸을 걸었는데, 목록이 답하는 것은 운영 시작일과
   * 운영 종료일 두 열이라 "언제 시작해서 언제까지 하는 사업인가"를 물을 길이 없었다.
   */
  startFrom: string
  /** 운영 종료일(end_date) 상한. '' = 미적용. */
  endTo: string
}

/**
 * 사업구분 필터에서 '미지정'(category is null)을 가리키는 표식.
 * 실제 분류 코드와 겹치지 않도록 DB에 존재할 수 없는 모양을 쓴다.
 */
export const UNCLASSIFIED_CATEGORY = '__none__'

/** 필터 초기값(전부 미적용). */
export const EMPTY_PROGRAM_FILTERS: ProgramFilters = {
  statuses: [],
  categories: [],
  departmentLineages: [],
  startFrom: '',
  endTo: '',
}

/** 하나라도 활성 필터가 있는지. */
export function hasActiveProgramFilters(f: ProgramFilters): boolean {
  return (
    f.statuses.length > 0 ||
    f.categories.length > 0 ||
    f.departmentLineages.length > 0 ||
    f.startFrom !== '' ||
    f.endTo !== ''
  )
}

/**
 * 사업구분 필터 → 조회 조건. '미지정'이 섞이면 `is null`을 OR로 함께 묶어야 하므로
 * 단순 in 조건으로 끝나지 않는다.
 */
function categoryCondition(selected: string[]): LedgerCondition {
  const codes = selected.filter((c) => c !== UNCLASSIFIED_CATEGORY)
  const withNull = selected.includes(UNCLASSIFIED_CATEGORY)
  if (!withNull) return { kind: 'in', column: 'category', values: codes }
  if (!codes.length) return { kind: 'or', expr: 'category.is.null' }
  return { kind: 'or', expr: `category.in.(${codes.join(',')}),category.is.null` }
}

/** 사업 목록 페이지. 다른 원장 목록과 동일 규약(rows + 건수 둘). */
export type ProgramPage = LedgerPage<Program>

/**
 * 살아 있는 사업 판정 컬럼. 사업 원장은 병합을 쓰지 않아 soft delete 컬럼 하나다
 * (인덱스 부분 조건과 일치 — 20260731220000).
 */
const PROGRAM_LIVE_COLUMNS = ['deleted_at'] as const

/**
 * '이 목록이 무엇인가'를 정하는 스코프 조건(내 사업 / 전체).
 * 목록 조회와 진행 현황 집계가 반드시 같은 모수를 봐야 하므로 한 곳에서 만든다 —
 * 갈라지면 파이프라인 단계 합과 목록 전체 건수가 어긋난다.
 */
async function programScopeConditions(
  config: ProgramWorkspaceConfig,
  mineUserId: string | null | undefined,
): Promise<LedgerCondition[]> {
  const scope: LedgerCondition[] = []
  // '내 사업' 스코프: 생성자(created_by=나) OR 담당자(담당자 원장.user_id=나).
  // 담당은 원장 밖에 있어 조인으로 걸 수 없으므로 담당 사업 id를 먼저 모은다.
  if (mineUserId) {
    const ids = await managedRecordIds(config.tables.managers, 'program_id', mineUserId)
    const parts = [`created_by.eq.${mineUserId}`]
    if (ids.length) parts.push(`id.in.(${ids.join(',')})`)
    scope.push({ kind: 'or', expr: parts.join(',') })
  }
  return scope
}

/**
 * '지금 무엇을 찾고 있나'를 정하는 좁힘 조건(검색어 + 필터).
 * 목록과 진행 현황 집계가 한 함수를 공유한다 — 조건을 두 벌로 두면 같은 화면에서
 * 목록은 3건인데 단계 합은 10건인 상태가 언제든 생긴다.
 *
 * `withStatus`가 false면 상태 조건만 뺀다. 진행 현황 카드가 그렇게 부른다 —
 * 그 카드는 상태 필터를 스스로 만들어 내는 자리라, 자기가 만든 조건을 자기 집계에 도로
 * 걸면 고른 단계만 남고 나머지 칸이 전부 0이 되어 되돌릴 근거(분포)가 사라진다.
 */
async function programNarrowConditions(
  config: ProgramWorkspaceConfig,
  keyword: string,
  filters: ProgramFilters,
  withStatus: boolean,
): Promise<LedgerCondition[]> {
  const narrow: LedgerCondition[] = []
  // 검색: 프로그램명 + 생성자(이름 → created_by id 역조회).
  const kw = sanitizeOrValue(keyword)
  if (kw) {
    const parts = [`title.ilike.%${kw}%`]
    const userIds = await userIdsByName(kw)
    if (userIds.length) parts.push(`created_by.in.(${userIds.join(',')})`)
    narrow.push({ kind: 'or', expr: parts.join(',') })
  }
  if (filters.departmentLineages.length) {
    narrow.push({
      kind: 'in',
      column: 'id',
      values: await programIdsByDepartment(config, filters.departmentLineages),
    })
  }
  if (withStatus && filters.statuses.length)
    narrow.push({ kind: 'in', column: 'status', values: filters.statuses })
  if (filters.categories.length) narrow.push(categoryCondition(filters.categories))
  // 두 칸은 서로 다른 컬럼을 본다 — 함께 걸면 "이 날 이후 시작해서 이 날 이전에 끝나는 사업",
  // 즉 지정한 구간 안에 운영기간이 통째로 들어가는 사업만 남는다.
  if (filters.startFrom) narrow.push({ kind: 'gte', column: 'start_date', value: filters.startFrom })
  if (filters.endTo) narrow.push({ kind: 'lte', column: 'end_date', value: filters.endTo })
  return narrow
}

/** 목록용 축약 select 문자열. 담당자·부서 임베드 테이블명·FK 힌트를 config로 조립한다. */
function programListCols(config: ProgramWorkspaceConfig): string {
  const { departments, managers } = config.tables
  return (
    'id, code, category, title, status, start_date, end_date, description, updated_at, ' +
    // 담당 부서 컬럼은 메인 부서 하나만 적지만, 부서명은 상위까지 붙는 표기라 여기서 이름을 완성할 수
    // 없다(상위는 다른 행이다). id·구분만 받아 화면에서 조직도로 푼다.
    `departments:${departments}(org_version_id, department_id, kind, collaboration_ratio), ` +
    `managers:${managers}(user_id, user:users!${managers}_user_id_fkey(id, name)), ` +
    'creator:users!created_by(id, name)'
  )
}

/**
 * 프로그램 원장 전용 서버 사이드 페이지네이션 훅.
 * 다중 필드 검색(프로그램명·생성자)과 복수 필터(상태·시작일 범위)를 처리한다.
 * (STARTUP useStartupPoolPage와 동일한 구조 — 프로그램 스키마에 맞춰 단순화.)
 */
export function useProgramsPage(
  keyword: string,
  filters: ProgramFilters,
  page: number,
  pageSize: number,
  /** 지정 시 생성자(created_by) 또는 담당자(담당자 원장)가 이 사용자인 사업만 조회한다('내 사업'). */
  mineUserId?: string | null,
) {
  const config = useProgramWorkspace()
  return useQuery({
    queryKey: [config.key, 'programs', 'page', keyword, filters, page, pageSize, mineUserId ?? null],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ProgramPage> => {
      const scope = await programScopeConditions(config, mineUserId)
      const narrow = await programNarrowConditions(config, keyword, filters, true)

      return fetchLedgerPage<Program>({
        table: config.tables.programs,
        select: programListCols(config),
        liveColumns: PROGRAM_LIVE_COLUMNS,
        order: { column: 'created_at', ascending: false },
        page,
        pageSize,
        scope,
        narrow,
      })
    },
  })
}

/** 지금 보고 있는 모수(스코프 + 검색·필터, 상태 제외)의 상태별 분포. 진행 현황 뷰의 원천. */
export interface ProgramStatusCounts {
  /** program_status 값 → 건수. 워크스페이스 수명주기의 모든 상태를 담는다(0건 포함). */
  byStatus: Record<string, number>
  /** 모수 전체 건수(상태 무관). 단계 합과 반드시 같은 조건에서 센다. */
  total: number
  /**
   * 수명주기 밖 건수 = 전체 − 수명주기 상태 합. 구 상태값(모집·심사 등) 잔여분이 여기 잡힌다.
   * 제안 단계를 쓰지 않는 워크스페이스에서는 제안 상태로 남은 레거시 행도 여기에 들어온다
   * (20260803120000 마이그레이션이 환산했으므로 정상 운영에서는 0이다).
   */
  other: number
}

/**
 * 상태별 건수 집계. 행을 내려받아 세지 않고 상태마다 count 질의를 던진다 —
 * 행으로 세면 PostgREST 기본 상한(1000행)에 걸리는 순간 조용히 작은 수를 답하게 된다.
 *
 * 검색어와 필터를 목록과 똑같이 반영한다(상태만 제외 — programNarrowConditions 주석 참조).
 * 반영하지 않으면 "부서를 좁혀 놓고 그 부서 사업이 어느 단계에 몰렸는지" 같은, 이 카드가
 * 가장 잘 답할 질문에 답하지 못한 채 목록과 다른 모수를 보여 준다.
 * 캐시 키에 상태를 넣지 않는 것도 같은 이유다 — 단계를 눌러도 집계는 그대로여야 하는데
 * 키가 흔들리면 누를 때마다 같은 답을 다시 받아 온다.
 */
export function useProgramStatusCounts(
  /** 지정 시 생성자 또는 담당자가 이 사용자인 사업만 집계한다('내 사업'). */
  mineUserId: string | null | undefined,
  keyword: string,
  filters: ProgramFilters,
) {
  const config = useProgramWorkspace()
  return useQuery({
    queryKey: [
      config.key,
      'programs',
      'status-counts',
      mineUserId ?? null,
      keyword,
      filters.categories,
      filters.departmentLineages,
      filters.startFrom,
      filters.endTo,
    ],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ProgramStatusCounts> => {
      const conditions = [
        ...(await programScopeConditions(config, mineUserId)),
        ...(await programNarrowConditions(config, keyword, filters, false)),
      ]
      const base = { table: config.tables.programs, liveColumns: PROGRAM_LIVE_COLUMNS }
      const statuses = programStatusOptions(config.hasProposalStage)
      const [total, ...perStatus] = await Promise.all([
        countLedgerRows({ ...base, conditions }),
        ...statuses.map((status) =>
          countLedgerRows({
            ...base,
            conditions: [...conditions, { kind: 'eq', column: 'status', value: status }],
          }),
        ),
      ])
      const byStatus = Object.fromEntries(statuses.map((status, i) => [status, perStatus[i] ?? 0]))
      const known = perStatus.reduce((sum, n) => sum + n, 0)
      return { byStatus, total, other: Math.max(0, total - known) }
    },
  })
}

/**
 * 담당 부서 필터를 사업 id 목록으로 환산한다.
 * 계보 → (전 조직 버전의) 부서 id → 그 부서가 배정된 사업 id 순으로 좁힌다. 부서 구성은
 * 사업 원장이 아니라 별도 원장에 있어 조인 조건으로 한 번에 걸 수 없다.
 * 걸리는 사업이 없으면 공집합 표식을 돌려준다 — 빈 배열을 그대로 넘기면 조건이 사라져
 * 필터를 걸었는데 전체가 나온다.
 */
async function programIdsByDepartment(
  config: ProgramWorkspaceConfig,
  lineages: string[],
): Promise<string[]> {
  const { data: deptRows } = await supabase
    .from('departments')
    .select('id')
    .in('lineage_id', lineages)
  const deptIds = ((deptRows ?? []) as { id: string }[]).map((d) => d.id)
  if (!deptIds.length) return [NO_MATCH_ID]

  const { data: assigned } = await supabase
    .from(config.tables.departments)
    .select('program_id')
    .in('department_id', deptIds)
  const programIds = [
    ...new Set(((assigned ?? []) as { program_id: string }[]).map((r) => r.program_id)),
  ]
  return programIds.length ? programIds : [NO_MATCH_ID]
}

/** 프로그램 비활성화(소프트 삭제 — deleted_at 기록). */
export function useDeactivateProgram() {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(config.tables.programs)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: [config.key, 'programs'] })
      // 비활성화도 이제 원장 트리거가 'deactivated'로 남기므로 변동 이력을 무효화한다.
      void qc.invalidateQueries({ queryKey: [config.key, 'contributions', id] })
    },
  })
}
