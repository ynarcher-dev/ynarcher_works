import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { SHARED_TABLES, useProgramWorkspace } from '@/features/program/workspace'

/**
 * 기본 템플릿 3종(글쓰기·URL첨부·파일첨부)의 데이터 접근.
 *
 * 글·링크는 워크스페이스별로 원장이 분리되어 있어(program_posts / ma_ / project_) 테이블명을
 * config에서 받고, 캐시 키에도 워크스페이스 키를 넣어 세 원장의 목록이 섞이지 않게 한다.
 * 파일은 원장이 하나(attachments)이므로 여기가 아니라 networks/materialHooks가 담당한다.
 */

/** 글쓰기 모듈의 글 1건. */
export interface ProgramPost {
  id: string
  title: string
  body: string | null
  activity_date: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

const POST_COLS = 'id, title, body, activity_date, created_by, created_at, updated_at'

/** 모듈에 속한 글 목록(미삭제, 최신순). */
export function useModulePosts(moduleId: string | undefined) {
  const config = useProgramWorkspace()
  return useQuery({
    queryKey: [config.key, 'module-posts', moduleId],
    enabled: Boolean(moduleId),
    queryFn: async (): Promise<ProgramPost[]> => {
      const { data, error } = await supabase
        .from(SHARED_TABLES.posts)
        .select(POST_COLS)
        .eq('program_module_id', moduleId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as unknown as ProgramPost[]
    },
  })
}

/** 글 저장(id 있으면 수정, 없으면 신규). created_by는 DB 기본값이 채운다. */
export function useSavePost(programId: string, moduleId: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  return useMutation({
    mutationFn: async (input: { id?: string; title: string; body: string }) => {
      if (input.id) {
        const { error } = await supabase
          .from(SHARED_TABLES.posts)
          .update({ title: input.title, body: input.body })
          .eq('id', input.id)
        if (error) throw error
        return
      }
      const { error } = await supabase.from(SHARED_TABLES.posts).insert({
        entity_key: config.entityKey,
        program_id: programId,
        program_module_id: moduleId,
        title: input.title,
        body: input.body,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [config.key, 'module-posts', moduleId] }),
  })
}

/** 글 소프트 삭제(물리 삭제 금지). */
export function useDeletePost(moduleId: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(SHARED_TABLES.posts)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [config.key, 'module-posts', moduleId] }),
  })
}

/** URL첨부 모듈의 링크 1건. */
export interface ProgramLink {
  id: string
  label: string
  url: string
  description: string | null
  sort_order: number
}

const LINK_COLS = 'id, label, url, description, sort_order'

/** 모듈에 속한 링크 목록(미삭제, 지정 순서). */
export function useModuleLinks(moduleId: string | undefined) {
  const config = useProgramWorkspace()
  return useQuery({
    queryKey: [config.key, 'module-links', moduleId],
    enabled: Boolean(moduleId),
    queryFn: async (): Promise<ProgramLink[]> => {
      const { data, error } = await supabase
        .from(SHARED_TABLES.links)
        .select(LINK_COLS)
        .eq('program_module_id', moduleId)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(200)
      if (error) throw error
      return (data ?? []) as unknown as ProgramLink[]
    },
  })
}

/**
 * 링크 저장(id 있으면 수정, 없으면 신규).
 * URL은 DB CHECK가 http/https만 받는다 — 화면 검증은 안내용이고 강제는 서버가 한다.
 */
export function useSaveLink(programId: string, moduleId: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      label: string
      url: string
      description: string | null
      sortOrder: number
    }) => {
      const values = {
        label: input.label,
        url: input.url,
        description: input.description,
        sort_order: input.sortOrder,
      }
      if (input.id) {
        const { error } = await supabase
          .from(SHARED_TABLES.links)
          .update(values)
          .eq('id', input.id)
        if (error) throw error
        return
      }
      const { error } = await supabase
        .from(SHARED_TABLES.links)
        .insert({
          ...values,
          entity_key: config.entityKey,
          program_id: programId,
          program_module_id: moduleId,
        })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [config.key, 'module-links', moduleId] }),
  })
}

/** 링크 소프트 삭제(물리 삭제 금지). */
export function useDeleteLink(moduleId: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(SHARED_TABLES.links)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [config.key, 'module-links', moduleId] }),
  })
}
