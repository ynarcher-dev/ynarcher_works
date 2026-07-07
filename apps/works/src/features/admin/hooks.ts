import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PermLevel, RoleKey } from '@/features/admin/config'

export interface TemplateRow {
  user_type: RoleKey
  workspace_key: string
  permission_level: PermLevel
}

/** 역할×워크스페이스 기본 권한 매트릭스(permission_templates 전체). */
export function usePermissionMatrix() {
  return useQuery({
    queryKey: ['admin', 'templates'],
    queryFn: async (): Promise<TemplateRow[]> => {
      const { data, error } = await supabase
        .from('permission_templates')
        .select('user_type, workspace_key, permission_level')
      if (error) throw error
      return (data ?? []) as TemplateRow[]
    },
  })
}

/** 권한 토글 적용(RPC: 템플릿 갱신 + 실 권한 전파 + 감사 로그 + Self-Lockout 방지). */
export function useSetPermission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      user_type: RoleKey
      workspace_key: string
      level: PermLevel
    }) => {
      const { error } = await supabase.rpc('admin_set_permission_template', {
        p_user_type: v.user_type,
        p_workspace_key: v.workspace_key,
        p_level: v.level,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'templates'] })
      qc.invalidateQueries({ queryKey: ['admin', 'audit'] })
    },
  })
}

export interface AuditLog {
  id: string
  actor_user_id: string | null
  action: string
  changed_workspace: string | null
  before_permission: string | null
  after_permission: string | null
  before_data: unknown
  after_data: unknown
  request_ip: string | null
  created_at: string
}

export function useAuditLogs() {
  return useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: async (): Promise<AuditLog[]> => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select(
          'id, actor_user_id, action, changed_workspace, before_permission, after_permission, before_data, after_data, request_ip, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as AuditLog[]
    },
  })
}

export interface Tag {
  id: string
  name: string
  sort_order: number
  created_at: string
  updated_at: string
  /** 2뎁스 태그(예: 국가)의 부모 FK. 부모 컬럼을 함께 조회할 때만 채워진다. */
  region_tag_id?: string | null
}

/** 태그 쓰기 시 부모 FK 지정(2뎁스 태그 전용). */
export interface TagParentValue {
  column: string
  id: string | null
}

/**
 * 태그 목록(미삭제, 표시순). 산업/분야 등 기준정보 태그 테이블 공용.
 * `parentColumn`을 주면 2뎁스 태그의 부모 FK(예: region_tag_id)를 함께 조회한다.
 */
export function useTags(table: string, parentColumn?: string, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'tags', table],
    enabled,
    queryFn: async (): Promise<Tag[]> => {
      const cols = parentColumn
        ? `id, name, sort_order, created_at, updated_at, ${parentColumn}`
        : 'id, name, sort_order, created_at, updated_at'
      const { data, error } = await supabase
        .from(table)
        .select(cols)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as Tag[]
    },
  })
}

/** 태그 추가. 2뎁스 태그는 `parent`로 부모 FK를 함께 지정한다. */
export function useCreateTag(table: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, parent }: { name: string; parent?: TagParentValue }) => {
      const row: Record<string, unknown> = { name }
      if (parent) row[parent.column] = parent.id
      const { error } = await supabase.from(table).insert(row)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tags', table] }),
  })
}

/** 태그명 수정. 2뎁스 태그는 `parent`로 부모 FK도 함께 갱신한다. */
export function useUpdateTag(table: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      name,
      parent,
    }: {
      id: string
      name: string
      parent?: TagParentValue
    }) => {
      const patch: Record<string, unknown> = { name }
      if (parent) patch[parent.column] = parent.id
      const { error } = await supabase.from(table).update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tags', table] }),
  })
}

/** 태그 삭제(soft delete). */
export function useDeleteTag(table: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tags', table] }),
  })
}

export interface AccessLog {
  id: string
  user_id: string | null
  resource_type: string | null
  resource_id: string | null
  reason: string | null
  created_at: string
}

export function useAccessLogs() {
  return useQuery({
    queryKey: ['admin', 'access'],
    queryFn: async (): Promise<AccessLog[]> => {
      const { data, error } = await supabase
        .from('access_logs')
        .select('id, user_id, resource_type, resource_id, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as AccessLog[]
    },
  })
}
