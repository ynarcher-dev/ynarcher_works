import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * 계정 입력창이 원장에서 받는 읽기 전용 사본.
 *
 * `sourceId`는 선택 체크를 페이지 사이에서 유지하기 위한 UI 키일 뿐이다. 계정 초안과 생성
 * 요청에는 들어가지 않는다. 전화번호를 비롯한 다른 원장 열은 이 계약에 존재하지 않는다.
 */
export interface GuestLedgerCandidate {
  sourceId: string
  name: string
  email: string | null
  affiliation: string | null
}

export interface GuestLedgerCandidatePage {
  rows: GuestLedgerCandidate[]
  total: number
}

export interface GuestLedgerCandidateProfile {
  name: string
  email: string
  affiliation: string
}

interface RawGuestLedgerCandidate {
  source_id: string
  name: string
  email: string | null
  affiliation: string | null
  total_count: number | string
}

export interface GuestLedgerCandidateQuery {
  search: string
  page: number
  pageSize: number
  category: string | null
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * 원장 후보를 계정 입력값으로 복사할 때 선택용 `sourceId`를 명시적으로 버린다.
 */
export function guestProfileFromLedgerCandidate(
  candidate: GuestLedgerCandidate,
): GuestLedgerCandidateProfile {
  return {
    name: candidate.name,
    email: candidate.email ?? '',
    affiliation: candidate.affiliation ?? '',
  }
}

/**
 * GUEST 계정 가져오기 전용 RPC만 호출한다. DB 함수의 반환 열도
 * `source_id,name,email,affiliation,total_count` 다섯 개로 제한되어야 한다.
 */
export async function fetchGuestLedgerCandidates(
  query: GuestLedgerCandidateQuery,
): Promise<GuestLedgerCandidatePage> {
  const { data, error } = await supabase.rpc('guest_account_ledger_candidates', {
    p_search: query.search.trim() || null,
    p_limit: query.pageSize,
    p_offset: query.page * query.pageSize,
    p_category: query.category,
  })
  if (error) throw error

  const rawRows = (data ?? []) as RawGuestLedgerCandidate[]
  return {
    // 응답 객체를 펼치지 않는다. DB 계약 밖의 열이 실수로 추가되어도 화면 모델로 전파하지 않는다.
    rows: rawRows.map((row) => ({
      sourceId: row.source_id,
      name: row.name.trim(),
      email: nullableText(row.email),
      affiliation: nullableText(row.affiliation),
    })),
    total: rawRows[0] ? Number(rawRows[0].total_count) : 0,
  }
}

export function useGuestLedgerCandidates(
  query: GuestLedgerCandidateQuery,
  enabled = true,
) {
  const normalizedSearch = query.search.trim()
  return useQuery({
    queryKey: [
      'guest-account-ledger-candidates',
      normalizedSearch,
      query.page,
      query.pageSize,
      query.category,
    ],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: () => fetchGuestLedgerCandidates({ ...query, search: normalizedSearch }),
  })
}
