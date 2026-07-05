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
