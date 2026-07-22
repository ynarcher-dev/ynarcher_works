import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** public.notifications 레코드(상단바 알림 표시 단위). RLS로 수신자 본인 것만 조회된다. */
export interface Notification {
  id: string
  actor_name: string | null
  type: string
  target_type: string
  target_id: string
  body_preview: string | null
  read_at: string | null
  created_at: string
}

const KEY = ['notifications'] as const

/** 내 알림 목록(최근순). 최근 30건만 — 상단바 드롭다운 표시용. */
export function useNotifications() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, actor_name, type, target_type, target_id, body_preview, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data ?? []) as Notification[]
    },
    // 다른 화면에 있는 동안 도착한 알림도 반영되도록 주기적으로 갱신한다.
    refetchInterval: 60_000,
  })
}

/** 단건 읽음 처리(read_at 스탬프). RLS로 본인 알림만 갱신된다. */
export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .is('read_at', null)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

/** 미읽음 전체 읽음 처리. */
export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
