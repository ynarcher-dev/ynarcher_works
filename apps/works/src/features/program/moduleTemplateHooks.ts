import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * 모듈 템플릿 카탈로그(`public.module_templates`) 데이터 접근.
 *
 * 종전에 네 곳으로 흩어져 있던 배치 정보(순서·분류·사용 여부·워크스페이스 노출·공유 상한)의
 * 단일 원천이다. 화면 메타(아이콘·진입 탭·라벨)는 여전히 코드가 갖는다 — 화면 구현이
 * 있어야만 성립하는 것은 원장으로 옮기지 않는다(없는 화면을 가리키는 행이 생긴다).
 *
 * 캐시 키에 워크스페이스를 넣지 않는다. 원장이 하나이고 세 워크스페이스가 같은 목록을 읽되
 * `workspaces` 배열로 걸러 쓰기 때문이며, 나눠 두면 ADMIN이 한 번 고친 뒤 어떤 워크스페이스는
 * 옛 목록을 계속 보게 된다.
 * 근거: docs/docs_planning/3_2_1_admin_module_registry.md
 */

/** 템플릿 분류. 라벨과 분류 자체의 순서는 화면 섹션 제목이기도 해서 코드가 갖는다. */
export const MODULE_CATEGORIES = [
  { key: 'BASE', label: '기본 템플릿' },
  { key: 'INTAKE', label: '모집·선발' },
  { key: 'OPERATION', label: '운영' },
  { key: 'OUTCOME', label: '성과' },
] as const

export type ModuleCategoryKey = (typeof MODULE_CATEGORIES)[number]['key']

export function moduleCategoryLabel(key: string): string {
  return MODULE_CATEGORIES.find((c) => c.key === key)?.label ?? key
}

export interface ModuleTemplate {
  key: string
  category: string
  sort_order: number
  /** 카탈로그: 새로 배치할 수 있는가. 끄면 기존 인스턴스는 그대로 동작한다. */
  is_active: boolean
  /** 카탈로그: 목록에 서는 워크스페이스(ac | mna | project). */
  workspaces: string[]
  /**
   * 성격: 이 종류가 쓰는 공유 범위(PUBLIC_LINK | GUEST_ONLY | INTERNAL_ONLY).
   *
   * 종전의 상한 2종(allow_guest·allow_public_link)을 대체한다 — 상한 두 개를 각각 올리고
   * 내리면 담당자 화면에 스위치가 둘 서게 되고, 그러면 무엇을 만져야 밖에 열리는지 이름만
   * 봐서는 알 수 없다. `PUBLIC_LINK`는 상한이 아니라 배타이며, 담당자는 그 결과를 받을 뿐
   * 고르지 않는다. 근거: docs/docs_planning/3_2_1_admin_module_registry.md
   */
  visibility: string
}

const TEMPLATE_COLS = 'key, category, sort_order, is_active, workspaces, visibility'

/** 카탈로그 전체(분류·순서대로). ADMIN 화면과 담당자 화면이 같은 목록을 본다. */
export function useModuleTemplates() {
  return useQuery({
    queryKey: ['module-templates'],
    queryFn: async (): Promise<ModuleTemplate[]> => {
      const { data, error } = await supabase
        .from('module_templates')
        .select(TEMPLATE_COLS)
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('key', { ascending: true })
      if (error) throw error
      return (data ?? []) as ModuleTemplate[]
    },
    // 배치는 자주 바뀌지 않고 여러 화면이 함께 읽으므로 받아 두고 재사용한다. 다만 오래
    // 붙들지는 않는다 — ADMIN이 다른 탭에서 고친 결과가 담당자 화면에 늦게 도착하면 "껐는데
    // 그대로다"로 읽히고, 그때 의심하는 대상은 캐시가 아니라 기능 자체가 된다.
    // (같은 탭에서 고친 경우는 저장 뒤 무효화가 즉시 처리한다.)
    staleTime: 60 * 1000,
  })
}

/** 키로 찾기 좋게 접은 형태. 상한을 묻는 화면(모듈 세팅)이 쓴다. */
export function useModuleTemplateMap() {
  const query = useModuleTemplates()
  const map = new Map((query.data ?? []).map((t) => [t.key, t]))
  return { ...query, map }
}

/**
 * 배치 저장(ADMIN). 여러 행을 한 트랜잭션에 반영한다 — 순서 이동은 이웃 행의 `sort_order`를
 * 함께 바꾸므로 부분 반영되면 순서가 깨진다.
 */
export function useSetModuleTemplates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: ModuleTemplate[]) => {
      const { error } = await supabase.rpc('set_module_templates', { p_rows: rows })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['module-templates'] }),
  })
}
