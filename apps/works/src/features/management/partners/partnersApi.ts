/**
 * 거래처 원장(public.trade_partners) 서버 훅 — MANAGEMENT '거래처 정보'가 소유한다.
 *
 * RLS: 조회 app.can_read_workspace('management') / 쓰기 app.can_write_workspace('management')
 * (supabase/migrations/20260903210000_trade_partners.sql).
 * 값 규칙(코드 형식·등록번호 자릿수·계좌 세 값 동반)은 DB check 제약이 최종 판정한다 —
 * 여기서 미리 걸러 주는 것(partnerForm.ts)은 저장을 눌러서야 알게 되지 않도록 하기 위해서다.
 *
 * 거래처 코드는 클라이언트가 만들지 않는다. `YN-` + 등록순 5자리를 원장 트리거가 잠금 아래에서
 * 채번한다 — 화면이 "다음 번호"를 읽어 그 값을 그대로 저장하면, 두 사람이 같은 순간에 등록할 때
 * 같은 번호가 두 번 발급된다.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PartnerType } from '@/features/management/partners/config'
import { formatPartnerCode } from '@/features/management/partners/partnerForm'

export interface TradePartner {
  id: string
  /** 표시용 코드(`YN-` + 등록순 5자리). 생성 열이라 발급 후 바뀌지 않는다. */
  code: string
  name: string
  partnerType: PartnerType
  /** 법인=사업자등록번호 10자리, 개인=생년월일 8자리. 숫자만 담긴다(표기는 화면이 만든다). */
  registrationNo: string | null
  /** 금융기관 코드 3자리. 이름표는 config의 bankLabel이 갖는다. */
  bankCode: string | null
  accountNo: string | null
  accountHolder: string | null
  /** 법인=사업자등록증, 개인=신분증. 경로와 표시용 파일명이 한 쌍이다. */
  licensePath: string | null
  licenseName: string | null
  bankbookPath: string | null
  bankbookName: string | null
  isActive: boolean
  createdBy: string | null
  updatedAt: string | null
}

/** 등록·수정 공용 입력. 코드는 서버가 붙이므로 여기에 없다(등록·수정 모두). */
export interface TradePartnerInput {
  name: string
  partnerType: PartnerType
  registrationNo: string | null
  bankCode: string | null
  accountNo: string | null
  accountHolder: string | null
  licensePath: string | null
  licenseName: string | null
  bankbookPath: string | null
  bankbookName: string | null
  isActive: boolean
}

interface PartnerRow {
  id: string
  code: string
  name: string
  partner_type: PartnerType
  registration_no: string | null
  bank_code: string | null
  account_no: string | null
  account_holder: string | null
  license_path: string | null
  license_name: string | null
  bankbook_path: string | null
  bankbook_name: string | null
  is_active: boolean
  created_by: string | null
  updated_at: string | null
}

const COLUMNS =
  'id, code, name, partner_type, registration_no, bank_code, account_no, account_holder, license_path, license_name, bankbook_path, bankbook_name, is_active, created_by, updated_at'

const toPartner = (r: PartnerRow): TradePartner => ({
  id: r.id,
  code: r.code,
  name: r.name,
  partnerType: r.partner_type,
  registrationNo: r.registration_no,
  bankCode: r.bank_code,
  accountNo: r.account_no,
  accountHolder: r.account_holder,
  licensePath: r.license_path,
  licenseName: r.license_name,
  bankbookPath: r.bankbook_path,
  bankbookName: r.bankbook_name,
  isActive: r.is_active,
  createdBy: r.created_by,
  updatedAt: r.updated_at,
})

/** 저장 페이로드. 코드는 원장 트리거가 붙이므로 여기에 담기지 않는다. */
const toPartnerRow = (v: TradePartnerInput) => ({
  name: v.name.trim(),
  partner_type: v.partnerType,
  registration_no: v.registrationNo,
  bank_code: v.bankCode,
  account_no: v.accountNo,
  account_holder: v.accountHolder,
  license_path: v.licensePath,
  license_name: v.licenseName,
  bankbook_path: v.bankbookPath,
  bankbook_name: v.bankbookName,
  is_active: v.isActive,
})

const PARTNERS_KEY = ['management', 'trade-partners']

/** 목록 필터. 값이 비어 있는 축은 조건을 걸지 않는다. */
export interface PartnerFilters {
  /** 구분(CORPORATE·INDIVIDUAL) 다중선택. */
  types: string[]
  /** 사용 여부. 'true'/'false' 다중선택(둘 다 고르면 조건 없음과 같다). */
  active: string[]
}

export const EMPTY_PARTNER_FILTERS: PartnerFilters = { types: [], active: [] }

export function hasActivePartnerFilters(f: PartnerFilters): boolean {
  return f.types.length > 0 || f.active.length > 0
}

export interface PartnerPage {
  rows: TradePartner[]
  /** 검색·필터가 반영된 건수(페이저·번호의 기준). */
  total: number
  /** 필터 미적용 전체 건수 — 표 좌측에 "반영/전체"로 적는다. */
  totalAll: number
}

/** PostgREST or 구문에서 값 구분자로 쓰이는 문자를 걷어낸다(검색어가 조건을 깨지 않도록). */
function sanitizeOrValue(v: string): string {
  return v.replace(/[(),]/g, ' ').trim()
}

/**
 * 거래처 목록(코드 순, 서버 페이지네이션).
 *
 * 정렬을 거래처명이 아니라 코드로 두는 이유는 코드가 곧 등록 순서이기 때문이다 — 방금 등록한
 * 거래처를 찾으려면 마지막 페이지를 보면 된다. 이름 순은 검색이 대신한다.
 *
 * 검색은 코드·거래처명·등록번호·예금주를 함께 훑는다. 등록번호는 숫자만 저장되어 있으므로
 * 하이픈을 걷어낸 형태로도 한 번 더 본다(사업자등록증에 적힌 대로 붙여 넣는 사람이 많다).
 */
export function usePartnersPage(
  keyword: string,
  filters: PartnerFilters,
  page: number,
  pageSize: number,
) {
  return useQuery({
    queryKey: [...PARTNERS_KEY, 'page', keyword, filters, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PartnerPage> => {
      const from = page * pageSize
      const kw = sanitizeOrValue(keyword)
      const digits = kw.replace(/\D/g, '')

      let q = supabase
        .from('trade_partners')
        .select(COLUMNS, { count: 'exact' })
        .is('deleted_at', null)
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
      // 두 값을 다 고른 것은 조건이 없는 것과 같다 — 그때는 절을 붙이지 않는다.
      if (filters.active.length === 1) q = q.eq('is_active', filters.active[0] === 'true')

      const { data, error, count } = await q
      if (error) throw error
      const total = count ?? 0

      let totalAll = total
      if (kw || hasActivePartnerFilters(filters)) {
        const { count: allCount } = await supabase
          .from('trade_partners')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
        totalAll = allCount ?? total
      }

      return { rows: ((data ?? []) as PartnerRow[]).map(toPartner), total, totalAll }
    },
  })
}

/**
 * 등록 폼이 보여 줄 다음 코드(미리보기). 확정값이 아니다 — 실제 번호는 저장 시점에 원장
 * 트리거가 잠금 아래에서 매긴다. 보여 주는 이유는 코드가 자동으로 붙는다는 사실 자체가
 * 화면에 드러나야 하기 때문이고, 그래서 폼은 이 값을 저장하지 않고 읽기 전용으로만 적는다.
 */
export function useNextPartnerCode() {
  return useQuery({
    queryKey: [...PARTNERS_KEY, 'next-code'],
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from('trade_partners')
        .select('code_seq')
        .order('code_seq', { ascending: false })
        .limit(1)
      if (error) throw error
      const last = (data?.[0] as { code_seq: number } | undefined)?.code_seq ?? 0
      return formatPartnerCode(last + 1)
    },
  })
}

/**
 * 등록번호 중복 확인 — 같은 번호가 이미 있으면 그 거래처를 돌려준다.
 * 막지는 않는다(사업장이 둘인 같은 사업자, 개인 거래처의 같은 생년월일이 있다). 다만 모르고
 * 두 번 등록하면 지급 대상이 갈리므로, 저장 전에 어느 거래처와 겹치는지 이름을 보여 준다.
 */
export function useDuplicateRegistrationNo(registrationNo: string, exceptId?: string) {
  return useQuery({
    queryKey: [...PARTNERS_KEY, 'dup-reg', registrationNo, exceptId ?? ''],
    enabled: registrationNo.length >= 8,
    queryFn: async (): Promise<TradePartner | null> => {
      let q = supabase
        .from('trade_partners')
        .select(COLUMNS)
        .eq('registration_no', registrationNo)
        .is('deleted_at', null)
        .limit(1)
      if (exceptId) q = q.neq('id', exceptId)
      const { data, error } = await q
      if (error) throw error
      const row = (data?.[0] as PartnerRow | undefined) ?? null
      return row ? toPartner(row) : null
    },
  })
}

export function useCreatePartner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: TradePartnerInput) => {
      // 코드(일련번호)와 생성자는 보내지 않는다 — 원장 트리거가 잠금 아래에서 채운다.
      const { error } = await supabase.from('trade_partners').insert(toPartnerRow(v))
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PARTNERS_KEY }),
  })
}

export function useUpdatePartner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: TradePartnerInput & { id: string }) => {
      const { error } = await supabase.from('trade_partners').update(toPartnerRow(v)).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PARTNERS_KEY }),
  })
}

/**
 * 사용 여부 일괄 전환 — 목록에서 여러 건을 골라 한 번에 중단하거나 되살린다.
 * 건마다 요청을 돌리지 않는다(중간에 끊기면 절반만 바뀐 목록을 사용자가 다시 세어 봐야 한다).
 */
export function useSetPartnersActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { ids: string[]; isActive: boolean }) => {
      if (!v.ids.length) return
      const { error } = await supabase
        .from('trade_partners')
        .update({ is_active: v.isActive })
        .in('id', v.ids)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PARTNERS_KEY }),
  })
}
