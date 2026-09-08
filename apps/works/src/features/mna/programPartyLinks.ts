import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type MaProgramPartyKind = 'BUY' | 'SELL'

/**
 * 프로젝트 구분이 어느 원장을 여는가. 여기 없는 구분(PE Fund·기타)은 매물을 연결하지 않는다.
 *
 * 화면이 아니라 여기 두는 이유는 같은 판정을 서버 RPC(`set_ma_program_party_links`)도 하기
 * 때문이다 — 등록 폼과 상세 패널이 각자 조건을 적으면 그 둘이 서버와 어긋날 자리가 둘이 된다.
 */
export function partyKindsOf(category: string | null | undefined): MaProgramPartyKind[] {
  if (category === 'SELL') return ['SELL']
  if (category === 'BUY') return ['BUY']
  if (category === 'SELL_BUY') return ['SELL', 'BUY']
  return []
}

export interface MaProgramPartyPick {
  id: string
  name: string
  wish: string | null
  available_funds: number | null
  industries: string[] | null
}

export interface MaProgramPartyLink extends MaProgramPartyPick {
  kind: MaProgramPartyKind
  /**
   * 퀵 리뷰를 마지막으로 저장한 시각·사람(SELLER만 — 퀵 리뷰는 파는 회사를 소개하는 문서다).
   * 퀵리뷰 모듈 카드의 기간·담당 칸이 이 값을 읽는다.
   */
  quickReviewWrittenAt: string | null
  quickReviewWriter: { id: string; name: string } | null
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
          'buyer_id, seller_id, buyer:ma_buyers!buyer_id(id, name, wish, available_funds, industries), ' +
            'seller:ma_sellers!seller_id(id, name, wish, available_funds, industries, quick_review_written_at, ' +
            'writer:users!ma_sellers_quick_review_written_by_fkey(id, name))',
        )
        .eq('program_id', programId!)
      if (error) throw error

      const links: MaProgramPartyLink[] = []
      for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        const buyer = row.buyer as MaProgramPartyPick | null
        if (buyer) {
          links.push({ ...buyer, kind: 'BUY', quickReviewWrittenAt: null, quickReviewWriter: null })
          continue
        }
        const seller = row.seller as
          | (MaProgramPartyPick & {
              quick_review_written_at: string | null
              writer: { id: string; name: string } | null
            })
          | null
        if (seller) {
          links.push({
            ...seller,
            kind: 'SELL',
            quickReviewWrittenAt: seller.quick_review_written_at,
            quickReviewWriter: seller.writer,
          })
        }
      }
      return links
    },
  })
}

/** 퀵리뷰 모듈이 기간·담당 자리에 세우는 값(연결된 매물의 퀵 리뷰 작성 사실). */
export interface QuickReviewAuthorship {
  /** 가장 이른 작성일(YYYY-MM-DD). 연결이 하나면 `to`와 같고, 아무도 안 썼으면 null. */
  from: string | null
  to: string | null
  /** 작성자(중복 제거). 순서는 작성일 오름차순이다. */
  writers: { id: string; name: string }[]
}

/**
 * 작성일은 **보는 사람의 날짜**로 적는다. timestamptz 문자열을 그냥 자르면(앱의 다른 화면들이
 * 그렇게 한다) UTC 기준이라 아침에 저장한 퀵 리뷰가 전날로 선다 — KST 오전 7시가 UTC로는
 * 전날 22시다.
 */
function localDate(ts: string): string {
  return new Date(ts).toLocaleDateString('sv-SE')
}

/**
 * 연결된 매물들의 퀵 리뷰 작성 사실을 모듈 한 줄로 접는다.
 *
 * **모듈에 적어 두지 않고 읽을 때마다 원장에서 접는 이유**는 이 모듈이 거울이기 때문이다 —
 * 같은 사실을 모듈에도 적으면 원장을 고쳤을 때 어느 쪽이 진짜인지 판정할 근거가 없다.
 * 연결이 여럿이면 기간은 가장 이른 작성일부터 가장 늦은 작성일까지이고(그 사이가 이 프로젝트의
 * 검토가 오간 구간이다), 담당은 그 문서들을 쓴 사람 전부다.
 */
export function quickReviewAuthorship(links: MaProgramPartyLink[]): QuickReviewAuthorship {
  const written = links
    .filter((l) => l.quickReviewWrittenAt)
    .sort((a, b) => a.quickReviewWrittenAt!.localeCompare(b.quickReviewWrittenAt!))
  const writers = new Map<string, { id: string; name: string }>()
  for (const l of written) {
    if (l.quickReviewWriter && !writers.has(l.quickReviewWriter.id)) {
      writers.set(l.quickReviewWriter.id, l.quickReviewWriter)
    }
  }
  const last = written.at(-1)
  return {
    from: written[0] ? localDate(written[0].quickReviewWrittenAt!) : null,
    to: last ? localDate(last.quickReviewWrittenAt!) : null,
    writers: [...writers.values()],
  }
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
      // 연결이 생기면 퀵리뷰 모듈이 서고 0건이 되면 걷힌다(둘 다 서버가 한다). 모듈 목록을
      // 비우지 않으면 워크플로우 줄이 방금 사라진 모듈을 계속 그리거나 새로 선 모듈을 빠뜨린다.
      void qc.invalidateQueries({ queryKey: ['mna', 'modules', programId] })
    },
  })
}
