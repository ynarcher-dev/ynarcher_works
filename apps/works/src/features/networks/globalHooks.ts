import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { GLOBAL_TABLE, type GlobalRow } from '@/features/networks/globalConfig'
import type { Contribution } from '@/features/networks/hooks'

/**
 * 목록/상세 조회 시 권역·국가명과 등록자(created_by → users)를 함께 임베드한다.
 * 국내 8종(useEntityPage)과 동일하게 creator를 실어 "등록자" 컬럼/항목이 비지 않게 한다.
 */
const SELECT_WITH_TAGS =
  '*, region:region_tags(name), country:country_tags(name), creator:users!created_by(id, name)'

/** 글로벌 네트워크 목록 페이지(0-base). 국내 useEntityPage와 동일 규약 + 태그 조인. */
export interface GlobalPage {
  rows: GlobalRow[]
  total: number
  totalAll: number
}

/**
 * 글로벌 네트워크 서버 사이드 페이지네이션(검색/미삭제/미병합).
 * 이름 검색은 ilike, 권역·국가명은 조인 임베드로 함께 조회한다. page는 0-base.
 */
export function useGlobalPage(keyword: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: ['networks', GLOBAL_TABLE, 'page', keyword, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<GlobalPage> => {
      const from = page * pageSize
      const to = from + pageSize - 1
      let q = supabase
        .from(GLOBAL_TABLE)
        .select(SELECT_WITH_TAGS, { count: 'exact' })
        .is('deleted_at', null)
        .is('merged_into_id', null)
        .order('name', { ascending: true })
        .range(from, to)
      const trimmed = keyword.trim()
      if (trimmed) q = q.ilike('name', `%${trimmed}%`)
      const { data, error, count } = await q
      if (error) throw error
      const total = count ?? 0

      let totalAll = total
      if (trimmed) {
        const { count: allCount } = await supabase
          .from(GLOBAL_TABLE)
          .select('*', { count: 'exact', head: true })
          .is('deleted_at', null)
          .is('merged_into_id', null)
        totalAll = allCount ?? total
      }
      return { rows: (data ?? []) as unknown as GlobalRow[], total, totalAll }
    },
  })
}

/** 글로벌 네트워크 단건 조회(수정 폼). id 미지정 시 비활성. */
export function useGlobalEntity(id: string | undefined) {
  return useQuery({
    queryKey: ['networks', GLOBAL_TABLE, 'detail', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<GlobalRow | null> => {
      const { data, error } = await supabase
        .from(GLOBAL_TABLE)
        .select(SELECT_WITH_TAGS)
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as unknown as GlobalRow | null
    },
  })
}

/** 글로벌 네트워크 레코드의 기여 이력(연혁, 오래된 순). 공동 관리자·타임라인 표시용. */
export function useGlobalContributions(id: string | undefined) {
  return useQuery({
    queryKey: ['networks', 'contributions', GLOBAL_TABLE, id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Contribution[]> => {
      const { data, error } = await supabase
        .from('entity_contributions')
        .select('*')
        .eq('entity_table', GLOBAL_TABLE)
        .eq('entity_id', id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Contribution[]
    },
  })
}

/** 동일 이름 중복 존재 여부(등록 전 검사). */
export async function checkGlobalDuplicateName(name: string): Promise<boolean> {
  const { data } = await supabase
    .from(GLOBAL_TABLE)
    .select('id')
    .eq('name', name)
    .is('deleted_at', null)
    .limit(1)
  return (data ?? []).length > 0
}

/** 글로벌 네트워크 생성(생성 id 반환). 생성자는 기여 로그로 함께 기록한다. */
export function useCreateGlobal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Record<string, unknown>): Promise<string> => {
      const { data, error } = await supabase
        .from(GLOBAL_TABLE)
        .insert(values)
        .select('id')
        .single()
      if (error) throw error
      const id = (data as { id: string }).id
      await recordGlobalContribution(id, 'created', '글로벌 네트워크 등록')
      return id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks', GLOBAL_TABLE] }),
  })
}

/** 글로벌 네트워크 수정. */
export function useUpdateGlobal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from(GLOBAL_TABLE).update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks', GLOBAL_TABLE] }),
  })
}

/**
 * 비활성화(soft delete). 파괴적 가드(기여자 검사)를 통과하도록 사유·행위자를
 * 기여 로그로 먼저 남긴 뒤 deleted_at을 설정한다(국내 DirectoryTab과 동일 규약).
 */
export function useDeactivateGlobal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await recordGlobalContribution(id, 'deactivated', reason)
      const { error } = await supabase
        .from(GLOBAL_TABLE)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks', GLOBAL_TABLE] }),
  })
}

/**
 * 기여 1건 기록(user_id·user_name은 서버 트리거가 현재 유저로 스탬프).
 * 부수 기록이라 실패해도 본 작업을 막지 않는다. entity_table은 다형 참조라 global_networks로 기록.
 */
export async function recordGlobalContribution(
  id: string,
  action: 'created' | 'merged' | 'enriched' | 'edited' | 'deactivated',
  note?: string | null,
): Promise<void> {
  await supabase.from('entity_contributions').insert({
    entity_table: GLOBAL_TABLE,
    entity_id: id,
    action,
    source: 'manual',
    note: note ?? null,
  })
}
