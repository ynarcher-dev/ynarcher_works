import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * 회의실 지점(예약 화면의 장소 탭) 서버 훅.
 * 지사 원장(features/office/branches/branchesApi)과 **연동하지 않는 독립 목록**이다 —
 * 지사는 조직 정보(주소·전화·배정인력), 지점은 예약 대상이 있는 장소라 생명주기가 다르다.
 * ADMIN('회의실 관리')이 편집하고 OFFICE('회의실 예약')가 소비한다.
 * RLS: 조회는 내부 사용자, 쓰기는 admin 전용(supabase/migrations/20260729190000_meeting_places.sql).
 */

export interface MeetingPlace {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
}

interface PlaceRow {
  id: string
  name: string
  sort_order: number
  is_active: boolean
}

const toPlace = (r: PlaceRow): MeetingPlace => ({
  id: r.id,
  name: r.name,
  sortOrder: r.sort_order,
  isActive: r.is_active,
})

const PLACES_KEY = ['office', 'meeting-places']

/** 지점 목록. includeInactive=true(ADMIN)면 비활성 포함, 기본(OFFICE)은 활성만. */
export function useMeetingPlaces(includeInactive = false) {
  return useQuery({
    queryKey: [...PLACES_KEY, includeInactive],
    queryFn: async (): Promise<MeetingPlace[]> => {
      let q = supabase
        .from('meeting_places')
        .select('id, name, sort_order, is_active')
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (!includeInactive) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return ((data ?? []) as PlaceRow[]).map(toPlace)
    },
  })
}

export function useCreateMeetingPlace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { name: string }) => {
      const name = v.name.trim()
      if (!name) throw new Error('지점명을 입력하세요.')
      // 새 지점은 탭 맨 뒤에 붙인다(sort_order는 화면에 노출하지 않는 정렬 전용 값).
      const { data: last, error: readErr } = await supabase
        .from('meeting_places')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
      if (readErr) throw readErr
      const { error } = await supabase
        .from('meeting_places')
        .insert({ name, sort_order: (last?.[0]?.sort_order ?? 0) + 10 })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PLACES_KEY }),
  })
}

export function useUpdateMeetingPlace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; name: string }) => {
      const name = v.name.trim()
      if (!name) throw new Error('지점명을 입력하세요.')
      const { error } = await supabase.from('meeting_places').update({ name }).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PLACES_KEY }),
  })
}

export function useSetMeetingPlaceActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('meeting_places')
        .update({ is_active: v.isActive })
        .eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PLACES_KEY }),
  })
}
