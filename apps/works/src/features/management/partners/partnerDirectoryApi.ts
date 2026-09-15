/**
 * 거래처 선택 목록 — 송금 요청이 읽는 자리.
 *
 * 원장(`trade_partners`)은 계좌번호와 개인 생년월일이 한 행에 있어 management 전용이다.
 * 송금 요청은 전 직원이 쓰므로 **가려진 뷰**(`trade_partners_directory`)를 읽는다 — 여기서
 * 나오는 계좌는 뒤 4자리뿐이고, 전체 계좌번호는 지급 직전에 경영지원이 원장에서 본다.
 * UI에서 숨기는 것이 아니라 뷰가 그 컬럼을 애초에 내지 않는다.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PartnerType } from '@/features/management/partners/config'

/** 선택 목록 한 줄. 계좌는 뒤 4자리만 온다. */
export interface PartnerOption {
  id: string
  code: string
  name: string
  partnerType: PartnerType
  bankCode: string | null
  accountNoLast4: string | null
  accountHolder: string | null
  isActive: boolean
  /** 비어 있으면 "확인 전" — 경영지원이 계좌 정보를 확인하기 전이다. */
  verifiedAt: string | null
}

interface DirectoryRow {
  id: string
  code: string
  name: string
  partner_type: PartnerType
  bank_code: string | null
  account_no_last4: string | null
  account_holder: string | null
  is_active: boolean
  verified_at: string | null
}

const DIRECTORY_KEY = ['management', 'partner-directory']

const toOption = (r: DirectoryRow): PartnerOption => ({
  id: r.id,
  code: r.code,
  name: r.name,
  partnerType: r.partner_type,
  bankCode: r.bank_code,
  accountNoLast4: r.account_no_last4,
  accountHolder: r.account_holder,
  isActive: r.is_active,
  verifiedAt: r.verified_at,
})

/**
 * 거래처 검색. 거래 중단된 거래처도 **함께 돌려준다** — 옛 송금 요청이 가리키는 거래처는
 * 중단된 뒤에도 그 이름을 답해야 하기 때문이다. 새로 고르는 자리에서는 화면이 가려 세운다.
 */
export function usePartnerOptions(keyword: string) {
  return useQuery({
    queryKey: [...DIRECTORY_KEY, keyword],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PartnerOption[]> => {
      const kw = keyword.trim().replace(/[(),]/g, ' ').trim()
      let q = supabase
        .from('trade_partners_directory')
        .select(
          'id, code, name, partner_type, bank_code, account_no_last4, account_holder, ' +
            'is_active, verified_at',
        )
        .order('code', { ascending: true })
        .limit(50)
      if (kw) {
        q = q.or(`code.ilike.%${kw}%,name.ilike.%${kw}%,account_holder.ilike.%${kw}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return ((data ?? []) as unknown as DirectoryRow[]).map(toOption)
    },
  })
}

/** 고른 거래처 한 건(표 칸이 이름·은행·예금주를 채우려면 id만으로는 모자란다). */
export function usePartnerOption(id: string | null | undefined) {
  return useQuery({
    queryKey: [...DIRECTORY_KEY, 'one', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<PartnerOption | null> => {
      const { data, error } = await supabase
        .from('trade_partners_directory')
        .select(
          'id, code, name, partner_type, bank_code, account_no_last4, account_holder, ' +
            'is_active, verified_at',
        )
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return data ? toOption(data as unknown as DirectoryRow) : null
    },
  })
}

/**
 * 지급에 필요한 한 건 — **계좌번호가 전체로 온다.**
 *
 * 목록·검색은 지금까지와 같이 가려진 뷰를 읽고(뒤 4자리), 이 한 건만 전용 RPC
 * (`trade_partner_payment_detail`)로 온다. 가르는 축은 사람이 아니라 **범위**다: 원장을 훑는
 * 일에는 계좌 전체가 필요 없고, 송금 요청서 한 줄을 채우는 일에는 그 한 건의 계좌가 필요하다.
 * 서버는 id 하나만 받고 한 행만 돌려주며, 그 조회는 `access_logs`에 남는다.
 */
export interface PartnerPaymentDetail {
  id: string
  code: string
  name: string
  partnerType: PartnerType
  bankCode: string | null
  /** 계좌번호 전체. 화면에서 이 값이 서는 자리는 송금 요청 표 한 곳뿐이다. */
  accountNo: string | null
  accountHolder: string | null
  isActive: boolean
  verifiedAt: string | null
}

interface PaymentDetailRow {
  id: string
  code: string
  name: string
  partner_type: PartnerType
  bank_code: string | null
  account_no: string | null
  account_holder: string | null
  is_active: boolean
  verified_at: string | null
}

/**
 * 고른 거래처 한 건의 지급 정보. 없는 id·열람 권한 없음은 **빈 결과**로 온다(행이 0개).
 *
 * 훅이 아니라 함수인 이유는 이 조회가 화면을 그리는 조회가 아니라 **고르는 순간 한 번 일어나는
 * 일**이기 때문이다. 캐시에 남기지 않는 것도 같은 판단이다 — 계좌 전체를 브라우저 메모리에
 * 쌓아 둘 이유가 없다(쓰고 나면 그 값은 문서의 사본으로 옮겨 간다).
 */
export async function fetchPartnerPaymentDetail(id: string): Promise<PartnerPaymentDetail | null> {
  const { data, error } = await supabase.rpc('trade_partner_payment_detail', { p_partner_id: id })
  if (error) throw error
  const row = ((data ?? []) as unknown as PaymentDetailRow[])[0]
  if (!row) return null
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    partnerType: row.partner_type,
    bankCode: row.bank_code,
    accountNo: row.account_no,
    accountHolder: row.account_holder,
    isActive: row.is_active,
    verifiedAt: row.verified_at,
  }
}

export interface QuickPartnerInput {
  name: string
  partnerType: PartnerType
  registrationNo: string | null
  bankCode: string | null
  accountNo: string | null
  accountHolder: string | null
}

/**
 * 송금 요청에서의 즉석 등록 — **원장에 먼저 들어가고** 그 다음 요청에 실린다.
 * 원장에 없는 거래처가 요청서에만 있는 상태는 만들지 않는다.
 *
 * 만들어지는 행은 언제나 "확인 전"이다(서버가 정한다 — 여기서 확인 여부를 보내지 않는다).
 */
export function useQuickRegisterPartner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: QuickPartnerInput): Promise<string> => {
      const { data, error } = await supabase.rpc('register_trade_partner_quick', {
        p_name: v.name.trim(),
        p_partner_type: v.partnerType,
        p_registration_no: v.registrationNo,
        p_bank_code: v.bankCode,
        p_account_no: v.accountNo,
        p_account_holder: v.accountHolder,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: DIRECTORY_KEY })
      void qc.invalidateQueries({ queryKey: ['management', 'trade-partners'] })
    },
  })
}

/**
 * 계좌 확인 — 경영지원이 계좌 정보를 보고 "확인 전" 딱지를 뗀다.
 * 확인한 사람은 화면이 보내지 않는다(원장 트리거가 세션에서 찍는다) — 확인은 책임이 따르는
 * 행위라 누가 했는지를 클라이언트가 주장하게 두지 않는다.
 */
export function useSetPartnerVerified() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; verified: boolean }) => {
      const { error } = await supabase
        .from('trade_partners')
        .update({ verified_at: v.verified ? new Date().toISOString() : null })
        .eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: DIRECTORY_KEY })
      void qc.invalidateQueries({ queryKey: ['management', 'trade-partners'] })
    },
  })
}
