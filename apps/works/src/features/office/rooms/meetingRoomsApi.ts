import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { RoomSchedule } from '@/features/office/rooms/availability'

/**
 * 회의실 원장 서버 훅.
 * ADMIN('회의실 관리')이 편집하고 OFFICE('회의실 예약')가 소비하는 단일 원천.
 * RLS: 조회는 내부 사용자, 쓰기는 admin 전용(supabase/migrations/20260728120000_meeting_rooms.sql).
 * 소속 지점 원장은 features/office/rooms/meetingPlacesApi가 소유한다 —
 * 지사 원장(branchesApi)과는 연동하지 않는 별개 목록이다.
 */

const PHOTO_BUCKET = 'meeting-room-photos'

export interface MeetingRoom {
  id: string
  placeId: string
  name: string
  location: string | null
  capacity: number | null
  photoPath: string | null
  openTime: string
  closeTime: string
  slotMinutes: number
  weekdays: number[]
  sortOrder: number
  isActive: boolean
}

/** MeetingRoom → availability 계산용 스케줄. */
export function roomSchedule(room: MeetingRoom): RoomSchedule {
  return {
    openTime: room.openTime,
    closeTime: room.closeTime,
    slotMinutes: room.slotMinutes,
    weekdays: room.weekdays,
  }
}

interface RoomRow {
  id: string
  place_id: string
  name: string
  location: string | null
  capacity: number | null
  photo_path: string | null
  open_time: string
  close_time: string
  slot_minutes: number
  weekdays: number[]
  sort_order: number
  is_active: boolean
}

const toRoom = (r: RoomRow): MeetingRoom => ({
  id: r.id,
  placeId: r.place_id,
  name: r.name,
  location: r.location,
  capacity: r.capacity,
  photoPath: r.photo_path,
  openTime: r.open_time,
  closeTime: r.close_time,
  slotMinutes: r.slot_minutes,
  weekdays: r.weekdays,
  sortOrder: r.sort_order,
  isActive: r.is_active,
})

const roomsKey = (placeId?: string) => ['office', 'meeting-rooms', placeId ?? 'all']

// ── 회의실 ───────────────────────────────────────────────────────────

const ROOM_COLS =
  'id, place_id, name, location, capacity, photo_path, open_time, close_time, ' +
  'slot_minutes, weekdays, sort_order, is_active'

/** 지점별 회의실 목록. includeInactive=true(ADMIN)면 비활성 포함. */
export function useMeetingRooms(placeId: string | undefined, includeInactive = false) {
  return useQuery({
    queryKey: [...roomsKey(placeId), includeInactive],
    enabled: Boolean(placeId),
    queryFn: async (): Promise<MeetingRoom[]> => {
      let q = supabase
        .from('meeting_rooms')
        .select(ROOM_COLS)
        .eq('place_id', placeId as string)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (!includeInactive) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return ((data ?? []) as unknown as RoomRow[]).map(toRoom)
    },
  })
}

/** 회의실 저장 입력(생성·수정 공용). */
export interface RoomInput {
  placeId: string
  name: string
  location: string | null
  capacity: number | null
  photoPath: string | null
  openTime: string
  closeTime: string
  slotMinutes: number
  weekdays: number[]
}

function roomPayload(v: RoomInput) {
  return {
    place_id: v.placeId,
    name: v.name.trim(),
    location: v.location?.trim() || null,
    capacity: v.capacity,
    photo_path: v.photoPath,
    open_time: v.openTime,
    close_time: v.closeTime,
    slot_minutes: v.slotMinutes,
    weekdays: v.weekdays,
  }
}

export function useCreateRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: RoomInput) => {
      if (!v.name.trim()) throw new Error('회의실명을 입력하세요.')
      const { data: last, error: readErr } = await supabase
        .from('meeting_rooms')
        .select('sort_order')
        .eq('place_id', v.placeId)
        .order('sort_order', { ascending: false })
        .limit(1)
      if (readErr) throw readErr
      const { error } = await supabase
        .from('meeting_rooms')
        .insert({ ...roomPayload(v), sort_order: (last?.[0]?.sort_order ?? 0) + 10 })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['office', 'meeting-rooms'] }),
  })
}

export function useUpdateRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: RoomInput & { id: string }) => {
      if (!v.name.trim()) throw new Error('회의실명을 입력하세요.')
      const { error } = await supabase.from('meeting_rooms').update(roomPayload(v)).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['office', 'meeting-rooms'] }),
  })
}

export function useSetRoomActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('meeting_rooms')
        .update({ is_active: v.isActive })
        .eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['office', 'meeting-rooms'] }),
  })
}

// ── 사진(공개 버킷, 업로드는 admin RLS) ──────────────────────────────

function safeName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_')
}

/** 회의실 사진 업로드 → 저장 경로 반환(meeting_rooms.photo_path에 보관). */
export async function uploadRoomPhoto(file: File): Promise<string> {
  const path = `${crypto.randomUUID()}-${safeName(file.name)}`
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) throw error
  return path
}

/** 저장 경로 → 공개 URL(없으면 null). */
export function roomPhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl
}
