import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type MaProgramPartyKind = 'BUY' | 'SELL'

export interface MaProgramPartyPick {
  id: string
  name: string
  wish: string | null
  available_funds: number | null
  industries: string[] | null
}

export interface MaProgramPartyLink extends MaProgramPartyPick {
  kind: MaProgramPartyKind
}

/** 프로젝트에 연결된 매물. 조인 행은 RLS로 프로젝트 접근 범위를 그대로 따른다. */
export function useMaProgramPartyLinks(programId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['mna', 'program-party-links', programId],
    enabled: enabled && Boolean(programId),
    queryFn: async (): Promise<MaProgramPartyLink[]> => {
      const { data, error } = await supabase
        .from('ma_program_party_links')
        .select(
          'buyer_id, seller_id, buyer:ma_buyers!buyer_id(id, name, wish, available_funds, industries), seller:ma_sellers!seller_id(id, name, wish, available_funds, industries)',
        )
        .eq('program_id', programId!)
      if (error) throw error

      const links: MaProgramPartyLink[] = []
      for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        const buyer = row.buyer as MaProgramPartyPick | null
        if (buyer) {
          links.push({ ...buyer, kind: 'BUY' })
          continue
        }
        const seller = row.seller as MaProgramPartyPick | null
        if (seller) links.push({ ...seller, kind: 'SELL' })
      }
      return links
    },
  })
}

/** 사업구분에 맞는 독립 원장을 검색 피커용으로 읽는다. */
export function useMaProgramPartyPool(kind: MaProgramPartyKind | null, enabled: boolean) {
  return useQuery({
    queryKey: ['mna', 'program-party-pool', kind],
    enabled: enabled && Boolean(kind),
    queryFn: async (): Promise<MaProgramPartyPick[]> => {
      const table = kind === 'SELL' ? 'ma_sellers' : 'ma_buyers'
      const { data, error } = await supabase
        .from(table)
        .select('id, name, wish, available_funds, industries')
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .limit(500)
      if (error) throw error
      return (data ?? []) as unknown as MaProgramPartyPick[]
    },
  })
}

/** 현재 연결을 전량 교체한다. 실제 원장 종류 판정은 DB가 프로젝트 category로 다시 검증한다. */
export function useSetMaProgramPartyLinks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      programId,
      buyerIds,
      sellerIds,
    }: {
      programId: string
      buyerIds: string[]
      sellerIds: string[]
    }) => {
      const { error } = await supabase.rpc('set_ma_program_party_links', {
        p_program_id: programId,
        p_buyer_ids: buyerIds,
        p_seller_ids: sellerIds,
      })
      if (error) throw error
    },
    onSuccess: (_data, { programId }) => {
      void qc.invalidateQueries({ queryKey: ['mna', 'program-party-links', programId] })
      void qc.invalidateQueries({ queryKey: ['mna', 'program', programId] })
    },
  })
}
