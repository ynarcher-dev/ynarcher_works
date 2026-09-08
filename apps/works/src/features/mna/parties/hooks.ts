import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchLedgerPage,
  sanitizeOrValue,
  type LedgerCondition,
  type LedgerPage,
} from '@/features/master/ledgerPage'
import type { Contribution } from '@/features/networks/hooks'
import {
  DECISION_UNSET,
  type MaPartyConfig,
  type MaPartyRow,
} from '@/features/mna/parties/config'
import { supabase } from '@/lib/supabase'

/**
 * 목록·상세가 함께 읽는 select 문자열. 생성자는 이름만 임베드한다.
 *
 * 진행여부는 **켠 원장에만 붙인다** — 바이어에는 컬럼 자체가 없어(20260908160000) 물으면
 * 조회가 통째로 실패한다. 설정으로 화면만 끄고 select는 그대로 두는 실수가 이 원장들처럼
 * 한 벌을 공유하는 화면에서 가장 흔하다.
 */
const selectOf = (cfg: MaPartyConfig) =>
  [
    'id, name, industries, wish, available_funds',
    ...(cfg.hasDecision ? ['decision'] : []),
    'contact_name, contact_email, startup_id, created_at, updated_at, created_by',
    'creator:users!created_by(id, name), startup:startups!startup_id(id, name)',
  ].join(', ')

/**
 * 캐시 키의 뿌리는 표 이름이다.
 *
 * 두 원장이 화면 한 벌을 공유하므로 키를 고정 문자열로 두면 BUYER 목록을 보고 온 캐시가
 * SELLER 목록으로 그대로 서고, 무효화도 서로를 지운다 — 갈리는 것은 데이터이지 화면이 아니다.
 */
const root = (cfg: MaPartyConfig) => ['ma-parties', cfg.table] as const

/**
 * 목록 한 페이지.
 *
 * 정렬은 최신 수정순이다 — 이 원장들은 이름으로 찾는 것이 아니라 "요즘 무엇이 움직였나"로
 * 읽는다(금액 순으로 세우고 싶은 날이 오면 그때 정렬 축을 연다).
 * 검색은 기업명과 희망사항 두 컬럼에 OR로 걸리며, 둘 다 trigram 인덱스를 갖는다 —
 * 한 컬럼이라도 인덱스가 없으면 플래너가 BitmapOr를 포기하고 순차 스캔으로 되돌아간다.
 */
export function useMaPartyListPage(
  cfg: MaPartyConfig,
  keyword: string,
  decisions: readonly string[],
  page: number,
  pageSize: number,
) {
  return useQuery({
    // 필터도 캐시 키에 든다 — 빠뜨리면 '진행'으로 좁힌 결과가 필터를 푼 목록으로 그대로 선다.
    queryKey: [...root(cfg), 'list', keyword, [...decisions].sort().join(','), page, pageSize],
    queryFn: async (): Promise<LedgerPage<MaPartyRow>> => {
      const narrow: LedgerCondition[] = []
      const kw = sanitizeOrValue(keyword)
      if (kw) narrow.push({ kind: 'or', expr: `name.ilike.%${kw}%,wish.ilike.%${kw}%` })

      // 미결정은 저장값이 아니라 null이라 값 배열에 섞이지 못한다. 그래서 표식만 떼어 내고
      // 한 축을 **OR 하나로** 묶는다 — 두 조건으로 나눠 걸면 AND가 되어 '진행 또는 미결정'이
      // 언제나 0건이 된다(고를 수 있다고 말하면서 아무것도 답하지 않는 조합).
      const wantsUnset = decisions.includes(DECISION_UNSET)
      const values = decisions.filter((d) => d !== DECISION_UNSET)
      if (wantsUnset || values.length > 0) {
        const parts: string[] = []
        if (values.length > 0) parts.push(`decision.in.(${values.join(',')})`)
        if (wantsUnset) parts.push('decision.is.null')
        narrow.push({ kind: 'or', expr: parts.join(',') })
      }

      return fetchLedgerPage<MaPartyRow>({
        table: cfg.table,
        select: selectOf(cfg),
        liveColumns: ['deleted_at'],
        order: { column: 'updated_at', ascending: false },
        page,
        pageSize,
        narrow,
      })
    },
  })
}

/** 상세 한 건. 본문(overview_html)은 목록이 읽지 않으므로 여기서만 가져온다. */
export function useMaPartyRecord(cfg: MaPartyConfig, id: string | undefined) {
  return useQuery({
    queryKey: [...root(cfg), 'detail', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<MaPartyRow | null> => {
      const { data, error } = await supabase
        .from(cfg.table)
        // 퀵 리뷰는 상세에서만 읽는다 — 목록이 열 줄짜리 문서 일곱 절을 함께 끌고 오면
        // 한 페이지 조회가 그 문서들의 크기만큼 무거워진다(본문 overview_html과 같은 이유).
        .select(`${selectOf(cfg)}, overview_html, quick_review`)
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      return (data as MaPartyRow | null) ?? null
    },
  })
}

/**
 * 등록.
 *
 * 변동 이력 'created'는 화면이 아니라 원장 트리거가 같은 트랜잭션에서 남긴다
 * (20260907130000·20260907160000) — 손으로 남기던 시절에는 임포터·일괄 이관이 이력에서
 * 통째로 빠졌다.
 */
export function useCreateMaParty(cfg: MaPartyConfig) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Record<string, unknown>): Promise<string> => {
      const { data, error } = await supabase
        .from(cfg.table)
        .insert(values)
        .select('id')
        .single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: root(cfg) }),
  })
}

/**
 * 수정(사유 필수).
 *
 * 사유는 원장 컬럼이 아니라 기여 로그의 note로만 남고 트리거는 사유를 알 수 없으므로,
 * 사유를 트랜잭션 컨텍스트(app.contribution_ctx)에 실어 주는 update_entity RPC를 경유한다.
 * 그 RPC는 SECURITY INVOKER라 쓰기 권한은 이 원장의 RLS가 그대로 판정한다.
 */
export function useUpdateMaParty(cfg: MaPartyConfig) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
      reason,
    }: {
      id: string
      values: Record<string, unknown>
      reason: string
    }) => {
      const { error } = await supabase.rpc('update_entity', {
        p_table: cfg.table,
        p_id: id,
        p_values: values,
        p_note: reason,
      })
      if (error) throw error
    },
    onSuccess: (_v, { id }) => {
      void qc.invalidateQueries({ queryKey: root(cfg) })
      void qc.invalidateQueries({ queryKey: [...root(cfg), 'contributions', id] })
    },
  })
}

/**
 * 사유를 남기는 삭제(소프트). 원장 UPDATE와 사유 기록이 한 트랜잭션에 묶이므로,
 * '삭제 기록만 남고 행은 살아 있는' 어긋난 상태가 생기지 않는다.
 */
export function useDeleteMaParty(cfg: MaPartyConfig) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('deactivate_entity', {
        p_entity_key: cfg.table,
        p_id: id,
        p_reason: reason,
      })
      if (error) throw error
    },
    onSuccess: (_v, { id }) => {
      void qc.invalidateQueries({ queryKey: root(cfg) })
      void qc.invalidateQueries({ queryKey: [...root(cfg), 'contributions', id] })
    },
  })
}

/**
 * 변동 이력. 기록(쓰기)은 클라이언트에 두지 않는다 — 원장 트리거가 남긴다.
 * 최초 기여순(오래된 순)으로 가져온다: `uniqueContributors`가 그 순서를 전제한다.
 */
export function useMaPartyContributions(cfg: MaPartyConfig, id: string | undefined) {
  return useQuery({
    queryKey: [...root(cfg), 'contributions', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Contribution[]> => {
      const { data, error } = await supabase
        .from('entity_contributions')
        .select('*')
        // 기여 로그의 다형 키는 단수 키가 아니라 표 이름이다(트리거 인자가 그 값이다).
        .eq('entity_table', cfg.table)
        .eq('entity_id', id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Contribution[]
    },
  })
}
