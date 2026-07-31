import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  NO_MATCH_ID,
  fetchLedgerPage,
  managedRecordIds,
  sanitizeOrValue,
  userIdsByName,
  type LedgerCondition,
  type LedgerPage,
} from '@/features/master/ledgerPage'
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
   * 담당 부서 계보 id(departments.lineage_id). 메인/협업을 가리지 않고 걸린다 —
   * 목록 표기에서 '외 N'으로 접힌 협업 부서로도 사업을 찾을 수 있어야 한다.
   * 부서 id가 아니라 계보 id인 이유: 부서 id는 조직 버전마다 새로 발급되므로, id로 거르면
   * 개편 전 단계에 같은 부서를 지정한 사업이 통째로 빠진다.
   */
  departmentLineages: string[]
  /** 시작일(start_date) 최소. '' = 미적용. */
  startFrom: string
  /** 시작일(start_date) 최대. '' = 미적용. */
  startTo: string
}

/** 필터 초기값(전부 미적용). */
export const EMPTY_PROGRAM_FILTERS: ProgramFilters = {
  statuses: [],
  departmentLineages: [],
  startFrom: '',
  startTo: '',
}

/** 하나라도 활성 필터가 있는지. */
export function hasActiveProgramFilters(f: ProgramFilters): boolean {
  return (
    f.statuses.length > 0 ||
    f.departmentLineages.length > 0 ||
    f.startFrom !== '' ||
    f.startTo !== ''
  )
}

/** 사업 목록 페이지. 다른 원장 목록과 동일 규약(rows + 건수 둘). */
export type ProgramPage = LedgerPage<Program>

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
  /** 지정 시 해당 사업구분(category)만 조회한다(사이드바 카테고리 세분화 메뉴). */
  category?: string | null,
  /** category와 함께 미분류(category is null) 건도 포함한다('기타' 항목). */
  includeUnclassified = false,
) {
  const config = useProgramWorkspace()
  return useQuery({
    queryKey: [
      config.key,
      'programs',
      'page',
      keyword,
      filters,
      page,
      pageSize,
      mineUserId ?? null,
      category ?? null,
      includeUnclassified,
    ],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ProgramPage> => {
      const kw = sanitizeOrValue(keyword)

      const scope: LedgerCondition[] = []
      // '내 사업' 스코프: 생성자(created_by=나) OR 담당자(담당자 원장.user_id=나).
      // 담당은 원장 밖에 있어 조인으로 걸 수 없으므로 담당 사업 id를 먼저 모은다.
      if (mineUserId) {
        const ids = await managedRecordIds(config.tables.managers, 'program_id', mineUserId)
        const parts = [`created_by.eq.${mineUserId}`]
        if (ids.length) parts.push(`id.in.(${ids.join(',')})`)
        scope.push({ kind: 'or', expr: parts.join(',') })
      }
      // 사업구분은 스코프의 일부이므로 검색·필터와 별개로 항상 적용한다.
      // '기타'는 미분류(null)까지 함께 담아 사각지대를 막는다.
      if (category && includeUnclassified) {
        scope.push({ kind: 'or', expr: `category.eq.${category},category.is.null` })
      } else if (category) {
        scope.push({ kind: 'eq', column: 'category', value: category })
      }

      const narrow: LedgerCondition[] = []
      // 검색: 프로그램명 + 생성자(이름 → created_by id 역조회).
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
      if (filters.statuses.length)
        narrow.push({ kind: 'in', column: 'status', values: filters.statuses })
      if (filters.startFrom)
        narrow.push({ kind: 'gte', column: 'start_date', value: filters.startFrom })
      if (filters.startTo)
        narrow.push({ kind: 'lte', column: 'start_date', value: filters.startTo })

      return fetchLedgerPage<Program>({
        table: config.tables.programs,
        select: programListCols(config),
        // 사업 원장은 병합을 쓰지 않아 soft delete 컬럼 하나다(인덱스 부분 조건과 일치).
        liveColumns: ['deleted_at'],
        order: { column: 'created_at', ascending: false },
        page,
        pageSize,
        scope,
        narrow,
      })
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
