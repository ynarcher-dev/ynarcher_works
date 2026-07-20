import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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
  /** 시작일(start_date) 최소. '' = 미적용. */
  startFrom: string
  /** 시작일(start_date) 최대. '' = 미적용. */
  startTo: string
}

/** 필터 초기값(전부 미적용). */
export const EMPTY_PROGRAM_FILTERS: ProgramFilters = {
  statuses: [],
  startFrom: '',
  startTo: '',
}

/** 하나라도 활성 필터가 있는지. */
export function hasActiveProgramFilters(f: ProgramFilters): boolean {
  return f.statuses.length > 0 || f.startFrom !== '' || f.startTo !== ''
}

/**
 * PostgREST `.or()` 값에서 문법 제어문자(콤마·괄호)를 제거해 필터 파싱이 깨지지 않게 한다.
 */
function sanitizeOrValue(v: string): string {
  return v.replace(/[(),]/g, ' ').trim()
}

export interface ProgramPage {
  rows: Program[]
  /** 검색어·필터 반영 건수(페이지 수·No. 넘버링 기준). */
  total: number
  /** 미삭제 전체 건수(검색·필터 미적용). */
  totalAll: number
}

/** 목록용 축약 select 문자열. 담당자 임베드 테이블명·FK 힌트를 config로 조립한다. */
function programListCols(config: ProgramWorkspaceConfig): string {
  const { managers } = config.tables
  return (
    'id, code, category, title, status, start_date, end_date, description, updated_at, ' +
    `managers:${managers}(user_id, user:users!${managers}_user_id_fkey(id, name)), ` +
    'creator:users!created_by(id, name)'
  )
}

/**
 * 프로그램 원장 전용 서버 사이드 페이지네이션 훅.
 * 다중 필드 검색(프로그램명·등록자)과 복수 필터(상태·시작일 범위)를 처리한다.
 * (STARTUP useStartupPoolPage와 동일한 구조 — 프로그램 스키마에 맞춰 단순화.)
 */
export function useProgramsPage(
  keyword: string,
  filters: ProgramFilters,
  page: number,
  pageSize: number,
  /** 지정 시 등록자(created_by) 또는 담당자(담당자 원장)가 이 사용자인 사업만 조회한다('내 사업'). */
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
      const from = page * pageSize
      const to = from + pageSize - 1
      const kw = sanitizeOrValue(keyword)

      // '내 사업' 필터: 등록자(created_by=나) OR 담당자(담당자 원장.user_id=나).
      // 담당 사업 id를 먼저 조회해 or 조건을 구성한다.
      let mineOr: string | null = null
      if (mineUserId) {
        const { data: mgr } = await supabase
          .from(config.tables.managers)
          .select('program_id')
          .eq('user_id', mineUserId)
        const ids = ((mgr ?? []) as { program_id: string }[]).map((m) => m.program_id)
        mineOr = ids.length
          ? `created_by.eq.${mineUserId},id.in.(${ids.join(',')})`
          : `created_by.eq.${mineUserId}`
      }

      // 사업구분 스코프. '기타'는 미분류(null)까지 함께 담아 사각지대를 막는다.
      const categoryOr = category
        ? includeUnclassified
          ? `category.eq.${category},category.is.null`
          : null
        : null

      let q = supabase
        .from(config.tables.programs)
        .select(programListCols(config), { count: 'exact' })
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, to)

      if (mineOr) q = q.or(mineOr)
      // 카테고리 세분화 메뉴는 스코프의 일부이므로 검색·필터와 별개로 항상 적용한다.
      if (categoryOr) q = q.or(categoryOr)
      else if (category) q = q.eq('category', category)

      // 검색: 프로그램명 + 등록자(이름 → created_by id 역조회).
      if (kw) {
        const orParts = [`title.ilike.%${kw}%`]
        const { data: matchedUsers } = await supabase
          .from('users')
          .select('id')
          .ilike('name', `%${kw}%`)
        const ids = ((matchedUsers ?? []) as { id: string }[]).map((u) => u.id)
        if (ids.length) orParts.push(`created_by.in.(${ids.join(',')})`)
        q = q.or(orParts.join(','))
      }

      if (filters.statuses.length) q = q.in('status', filters.statuses)
      if (filters.startFrom) q = q.gte('start_date', filters.startFrom)
      if (filters.startTo) q = q.lte('start_date', filters.startTo)

      const { data, error, count } = await q
      if (error) throw error
      const total = count ?? 0

      // 검색·필터가 하나도 없으면 반영 건수 == 전체 건수. 있을 때만 전체 건수를 별도 조회한다.
      // (전체 건수도 '내 사업'·카테고리 스코프는 반영한다.)
      let totalAll = total
      if (kw || hasActiveProgramFilters(filters)) {
        let allQ = supabase
          .from(config.tables.programs)
          .select('*', { count: 'exact', head: true })
          .is('deleted_at', null)
        if (mineOr) allQ = allQ.or(mineOr)
        if (categoryOr) allQ = allQ.or(categoryOr)
        else if (category) allQ = allQ.eq('category', category)
        const { count: allCount } = await allQ
        totalAll = allCount ?? total
      }

      return { rows: (data ?? []) as unknown as Program[], total, totalAll }
    },
  })
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
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [config.key, 'programs'] })
    },
  })
}
