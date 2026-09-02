/**
 * OFFICE 거래처 조회면 서버 훅 — 원장이 아니라 **가려진 뷰**를 읽는다.
 *
 * 대상: `public.trade_partners_directory`(20260903230000). 이 뷰는 계좌번호를 뒤 4자리로,
 * 개인 거래처의 생년월일을 연도로 자르고 증빙 서류 컬럼은 아예 내보내지 않는다. 원장
 * (`public.trade_partners`)의 SELECT는 여전히 management 전용이며 여기서는 건드리지 않는다 —
 * 화면에서 가리는 것은 보안이 아니므로, 가리는 일은 나가는 컬럼 자체를 바꿔서 한다.
 *
 * 그래서 이 파일에는 쓰기가 없다. 원장을 고치는 자리는 MANAGEMENT '거래처 정보' 하나다.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PartnerType } from '@/features/management/partners/config'

export interface PartnerDirectoryEntry {
  id: string
  code: string
  name: string
  partnerType: PartnerType
  /** 법인은 사업자등록번호 10자리 원본, 개인은 생년월일의 연도 4자리만 온다. */
  registrationNo: string | null
  bankCode: string | null
  /** 계좌번호 뒤 4자리. 통장과 대조할 만큼만 온다. */
  accountNoLast4: string | null
  accountHolder: string | null
  isActive: boolean
  updatedAt: string | null
}

interface DirectoryRow {
  id: string
  code: string
  name: string
  partner_type: PartnerType
  registration_no: string | null
  bank_code: string | null
  account_no_last4: string | null
  account_holder: string | null
  is_active: boolean
  updated_at: string | null
}

const COLUMNS =
  'id, code, name, partner_type, registration_no, bank_code, account_no_last4, account_holder, is_active, updated_at'

const toEntry = (r: DirectoryRow): PartnerDirectoryEntry => ({
  id: r.id,
  code: r.code,
  name: r.name,
  partnerType: r.partner_type,
  registrationNo: r.registration_no,
  bankCode: r.bank_code,
  accountNoLast4: r.account_no_last4,
  accountHolder: r.account_holder,
  isActive: r.is_active,
  updatedAt: r.updated_at,
})

const DIRECTORY_KEY = ['office', 'trade-partners-directory']

export interface DirectoryFilters {
  types: string[]
  /** 사용 여부. 'true'/'false' 다중선택(둘 다 고르면 조건 없음과 같다). */
  active: string[]
}

export const EMPTY_DIRECTORY_FILTERS: DirectoryFilters = { types: [], active: [] }

export function hasActiveDirectoryFilters(f: DirectoryFilters): boolean {
  return f.types.length > 0 || f.active.length > 0
}

export interface PartnerDirectoryPage {
  rows: PartnerDirectoryEntry[]
  total: number
  totalAll: number
}

/** PostgREST or 구문에서 값 구분자로 쓰이는 문자를 걷어낸다(검색어가 조건을 깨지 않도록). */
function sanitizeOrValue(v: string): string {
  return v.replace(/[(),]/g, ' ').trim()
}

/**
 * 거래처 목록(코드 순, 서버 페이지네이션).
 *
 * 검색이 훑는 범위는 화면에 보이는 값과 같다 — 코드·거래처명·예금주, 그리고 뷰가 내주는 만큼의
 * 등록번호(법인은 전부, 개인은 연도)다. 보이지 않는 값으로 찾을 수 있게 두면 검색창이 곧
 * 가려 둔 값을 확인하는 도구가 된다.
 */
export function usePartnerDirectoryPage(
  keyword: string,
  filters: DirectoryFilters,
  page: number,
  pageSize: number,
) {
  return useQuery({
    queryKey: [...DIRECTORY_KEY, 'page', keyword, filters, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PartnerDirectoryPage> => {
      const from = page * pageSize
      const kw = sanitizeOrValue(keyword)
      const digits = kw.replace(/\D/g, '')

      let q = supabase
        .from('trade_partners_directory')
        .select(COLUMNS, { count: 'exact' })
        .order('code', { ascending: true })
        .range(from, from + pageSize - 1)

      if (kw) {
        const clauses = [
          `code.ilike.%${kw}%`,
          `name.ilike.%${kw}%`,
          `account_holder.ilike.%${kw}%`,
        ]
        if (digits) clauses.push(`registration_no.ilike.%${digits}%`)
        q = q.or(clauses.join(','))
      }
      if (filters.types.length) q = q.in('partner_type', filters.types)
      if (filters.active.length === 1) q = q.eq('is_active', filters.active[0] === 'true')

      const { data, error, count } = await q
      if (error) throw error
      const total = count ?? 0

      let totalAll = total
      if (kw || hasActiveDirectoryFilters(filters)) {
        const { count: allCount } = await supabase
          .from('trade_partners_directory')
          .select('id', { count: 'exact', head: true })
        totalAll = allCount ?? total
      }

      return { rows: ((data ?? []) as DirectoryRow[]).map(toEntry), total, totalAll }
    },
  })
}
