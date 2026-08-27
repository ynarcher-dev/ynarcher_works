import { useQuery } from '@tanstack/react-query'
import { readModuleSettings, type ModuleSettings } from '@ynarcher/master-data'
import { useGuestStore } from '@/auth/guestStore'
import { useGuestClient } from '@/lib/useGuestClient'

/**
 * 게스트에게 공개된 메뉴(모듈)와 그 안의 내용.
 *
 * **어떤 조건도 여기서 걸지 않는다.** 무엇이 공개인지는 WORKS의 모듈 카드가 정하고, 판정은
 * 전적으로 RLS(`app.guest_module_ids()`)가 한다 — 공유 범위·켜짐·취소·사업 생존·세션 고정
 * 사업이 모두 그 한 함수에 모여 있다. 화면이 조건을 한 벌 더 들면, 담당자가 WORKS에서 스위치를
 * 내려도 게스트 쪽은 그대로인(혹은 그 반대인) 어긋남이 생긴다.
 */

/** 게스트 사이드바 한 줄이자 화면 하나의 원본. */
export interface GuestModule {
  id: string
  module_type: string
  title: string | null
  status: string
  visibility: string
  settings: unknown
}

const MODULE_COLS = 'id, module_type, title, status, visibility, settings'

/** 모듈 정렬: 시작일 오름차순 → 이름. 일정이 없는 메뉴는 뒤로 민다(WORKS 보드와 같은 규칙). */
function sortModules(modules: GuestModule[]): GuestModule[] {
  return [...modules].sort((a, b) => {
    const sa = readModuleSettings(a.settings).start_date ?? '9999'
    const sb = readModuleSettings(b.settings).start_date ?? '9999'
    if (sa !== sb) return sa.localeCompare(sb)
    return (a.title ?? '').localeCompare(b.title ?? '')
  })
}

/** 세션에 고정된 사업에서 공개된 메뉴 전체. GUEST 사이드바가 이 결과 그대로다. */
export function useGuestModules() {
  const client = useGuestClient()
  const programId = useGuestStore((s) => s.program)?.id
  return useQuery({
    queryKey: ['guest', 'modules', programId],
    enabled: Boolean(client),
    queryFn: async (): Promise<GuestModule[]> => {
      const { data, error } = await client!
        .from('program_modules')
        .select(MODULE_COLS)
        .limit(100)
      if (error) throw error
      return sortModules((data ?? []) as unknown as GuestModule[])
    },
  })
}

/** 모듈 1건의 일정·메모(WORKS 모듈 카드에서 세팅한 값). */
export function moduleSettings(mod: GuestModule | undefined): ModuleSettings {
  return readModuleSettings(mod?.settings)
}

/** 글쓰기 모듈의 글 1건(읽기 전용). */
export interface GuestPost {
  id: string
  title: string
  body: string | null
  activity_date: string | null
  created_at: string
}

/** 글쓰기 모듈의 글 목록(최신순). */
export function useModulePosts(moduleId: string | undefined) {
  const client = useGuestClient()
  return useQuery({
    queryKey: ['guest', 'module-posts', moduleId],
    enabled: Boolean(client && moduleId),
    queryFn: async (): Promise<GuestPost[]> => {
      const { data, error } = await client!
        .from('program_posts')
        .select('id, title, body, activity_date, created_at')
        .eq('program_module_id', moduleId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as unknown as GuestPost[]
    },
  })
}

/** URL첨부 모듈의 링크 1건. */
export interface GuestLink {
  id: string
  label: string
  url: string
  description: string | null
  sort_order: number
}

/** URL첨부 모듈의 링크 목록(운영자가 정한 순서). */
export function useModuleLinks(moduleId: string | undefined) {
  const client = useGuestClient()
  return useQuery({
    queryKey: ['guest', 'module-links', moduleId],
    enabled: Boolean(client && moduleId),
    queryFn: async (): Promise<GuestLink[]> => {
      const { data, error } = await client!
        .from('program_links')
        .select('id, label, url, description, sort_order')
        .eq('program_module_id', moduleId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(100)
      if (error) throw error
      return (data ?? []) as unknown as GuestLink[]
    },
  })
}

/** 파일첨부 모듈의 파일 1건(사업 자료와 같은 행). */
export interface GuestFile {
  id: string
  file_name: string
  content_type: string | null
  byte_size: number | null
  created_at: string
}

/** 파일첨부 모듈의 파일 목록(최신순). */
export function useModuleFiles(moduleId: string | undefined) {
  const client = useGuestClient()
  return useQuery({
    queryKey: ['guest', 'module-files', moduleId],
    enabled: Boolean(client && moduleId),
    queryFn: async (): Promise<GuestFile[]> => {
      const { data, error } = await client!
        .from('attachments')
        .select('id, file_name, content_type, byte_size, created_at')
        .eq('program_module_id', moduleId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as unknown as GuestFile[]
    },
  })
}
