import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProgramWorkspace } from '@/features/program/workspace'

/**
 * 모듈 공개 링크(로그인 없이 모듈 하나만 여는 단독 주소)의 데이터 접근.
 *
 * 공유 범위(visibility)와는 **다른 축**이다 — 공유 범위는 로그인한 사람 중 누가 보는가를,
 * 이 축은 로그인 없는 바깥에 문을 여는가를 답한다. 두 축은 서로를 전제하지 않으므로
 * 저장 경로도 따로 둔다(모듈 저장 RPC에 얹지 않는다).
 *
 * 원장은 셋이 아니라 하나이며 소유 워크스페이스는 `entity_key`가 답한다 — 익명 해석이
 * 토큰 하나로 시작하므로 토큰 유니크가 한 곳에서 강제되어야 하기 때문이다.
 * 근거: docs/docs_planning/3_4_15_ac_public_links.md
 */

/** 공개 상태. 아직 열지 않은 것(PRIVATE)과 열었다가 닫은 것(CLOSED)은 다른 사실이다. */
export type PublicLinkStatus = 'PRIVATE' | 'OPEN' | 'CLOSED'

export interface ModulePublicLink {
  id: string
  token: string
  status: PublicLinkStatus
  /** NULL이면 모듈 기간을 상속한다(같은 사실을 두 번 받지 않는다). */
  open_at: string | null
  close_at: string | null
  contact: string | null
  view_count: number
  last_viewed_at: string | null
}

const LINK_COLS = 'id, token, status, open_at, close_at, contact, view_count, last_viewed_at'

/** 공개 열람 URL(/p/:token). 배포 오리진은 환경변수, 없으면 현재 오리진. */
export function publicModuleUrl(token: string | null | undefined): string | null {
  if (!token) return null
  const base =
    (import.meta.env.VITE_PUBLIC_MODULE_BASE_URL as string | undefined)?.replace(/\/$/, '') ??
    `${window.location.origin}/p`
  return `${base}/${token}`
}

/**
 * 지금 바깥에 열려 있는 모듈 id 집합(보드·간트 배지용).
 *
 * 카드마다 따로 묻지 않고 사업의 모듈 목록을 한 번에 넣어 한 번만 묻는다 — 담당자가 사업
 * 상세를 훑을 때 알아야 하는 것은 '열린 문이 몇 개인가'이고, 그 답이 카드 수만큼의 요청으로
 * 흩어질 이유가 없다. 여기서 세는 것은 저장된 상태(OPEN)뿐이며 기간·모듈 생존까지 반영한
 * 최종 판정은 공개 경로가 한다(같은 판정을 화면에 복제하지 않는다).
 */
export function useOpenPublicLinkModuleIds(moduleIds: string[]) {
  const config = useProgramWorkspace()
  const key = [...moduleIds].sort().join(',')
  return useQuery({
    queryKey: [config.key, 'open-public-links', key],
    enabled: moduleIds.length > 0,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('program_module_public_links')
        .select('program_module_id')
        .eq('entity_key', config.entityKey)
        .eq('status', 'OPEN')
        .in('program_module_id', moduleIds)
      if (error) throw error
      return new Set((data ?? []).map((r) => r.program_module_id as string))
    },
  })
}

/** 모듈의 공개 링크 1건(없으면 null — 아직 켠 적이 없다는 뜻이다). */
export function useModulePublicLink(moduleId: string | undefined) {
  const config = useProgramWorkspace()
  return useQuery({
    queryKey: [config.key, 'module-public-link', moduleId],
    enabled: Boolean(moduleId),
    queryFn: async (): Promise<ModulePublicLink | null> => {
      const { data, error } = await supabase
        .from('program_module_public_links')
        .select(LINK_COLS)
        .eq('entity_key', config.entityKey)
        .eq('program_module_id', moduleId)
        .maybeSingle()
      if (error) throw error
      return (data as ModulePublicLink | null) ?? null
    },
  })
}

/** 링크 생성·수정. 최초 저장에서만 토큰이 발급되고 이후 고정된다. */
export function useSetModulePublicLink(moduleId: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  return useMutation({
    mutationFn: async (input: {
      status: PublicLinkStatus
      openAt: string | null
      closeAt: string | null
      contact: string | null
    }) => {
      const { data, error } = await supabase.rpc('set_module_public_link', {
        p_entity_key: config.entityKey,
        p_module_id: moduleId,
        p_status: input.status,
        p_open_at: input.openAt,
        p_close_at: input.closeAt,
        p_contact: input.contact,
      })
      if (error) throw error
      return data as { token: string }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [config.key, 'module-public-link', moduleId] }),
  })
}

/**
 * 주소 재발급. 옛 주소는 즉시 죽고 되살릴 수 없으므로 유출 대응에만 쓴다
 * — 껐다 켜는 것으로는 주소가 바뀌지 않는다(이미 배포한 공고문이 살아 있어야 한다).
 */
export function useRotateModulePublicLink(moduleId: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('rotate_module_public_link', {
        p_entity_key: config.entityKey,
        p_module_id: moduleId,
      })
      if (error) throw error
      return data as { token: string }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [config.key, 'module-public-link', moduleId] }),
  })
}
