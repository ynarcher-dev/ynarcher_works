import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { RoomSchedule } from '@/features/office/rooms/availability'

/**
 * 회의실 원장 서버 훅.
 * ADMIN('회의실 관리')이 편집하고 OFFICE('회의실 예약')가 소비하는 단일 원천.
 * RLS: 조회는 내부 사용자, 쓰기는 admin 전용(supabase/migrations/20260728120000_meeting_rooms.sql).
 * 소속 지사 원장은 features/office/branches/branchesApi가 소유한다 —
 * 지사 정보·자산 반출대장과 같은 목록을 쓴다(2026-08-20 지점 원장 폐기).
 */

const PHOTO_BUCKET = 'meeting-room-photos'

export interface MeetingRoom {
  id: string
  branchId: string
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
  branch_id: string
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
  branchId: r.branch_id,
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

const roomsKey = (branchId?: string) => ['office', 'meeting-rooms', branchId ?? 'all']
const BRANCH_IDS_KEY = ['office', 'meeting-room-branch-ids']

/** 회의실이 바뀌면 목록과 "회의실 있는 지사" 집합을 함께 무효화한다(탭 목록이 이 집합이다). */
function invalidateRooms(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['office', 'meeting-rooms'] })
  void qc.invalidateQueries({ queryKey: BRANCH_IDS_KEY })
}

// ── 회의실 ───────────────────────────────────────────────────────────

const ROOM_COLS =
  'id, branch_id, name, location, capacity, photo_path, open_time, close_time, ' +
  'slot_minutes, weekdays, sort_order, is_active'

/** 지사별 회의실 목록. includeInactive=true(ADMIN)면 비활성 포함. */
export function useMeetingRooms(branchId: string | undefined, includeInactive = false) {
  return useQuery({
    queryKey: [...roomsKey(branchId), includeInactive],
    enabled: Boolean(branchId),
    queryFn: async (): Promise<MeetingRoom[]> => {
      let q = supabase
        .from('meeting_rooms')
        .select(ROOM_COLS)
        .eq('branch_id', branchId as string)
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

/**
 * 회의실이 한 대라도 있는 지사 id 집합.
 * 예약 화면의 탭은 지사 전체가 아니라 이 집합으로 거른다 — 지사를 하나 추가할 때마다
 * 예약할 것이 없는 빈 탭이 생기는 문제가 원장을 둘로 나눴던 이유였다(2026-07-29).
 * includeInactive=true(ADMIN)면 비활성 회의실도 한 대로 친다.
 */
export function useRoomBranchIds(includeInactive = false) {
  return useQuery({
    queryKey: [...BRANCH_IDS_KEY, includeInactive],
    queryFn: async (): Promise<Set<string>> => {
      let q = supabase.from('meeting_rooms').select('branch_id').is('deleted_at', null)
      if (!includeInactive) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return new Set(((data ?? []) as { branch_id: string }[]).map((r) => r.branch_id))
    },
  })
}

/** 회의실 저장 입력(생성·수정 공용). */
export interface RoomInput {
  branchId: string
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
    branch_id: v.branchId,
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
        .eq('branch_id', v.branchId)
        .order('sort_order', { ascending: false })
        .limit(1)
      if (readErr) throw readErr
      const { error } = await supabase
        .from('meeting_rooms')
        .insert({ ...roomPayload(v), sort_order: (last?.[0]?.sort_order ?? 0) + 10 })
      if (error) throw error
    },
    onSuccess: () => invalidateRooms(qc),
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
    onSuccess: () => invalidateRooms(qc),
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
    onSuccess: () => invalidateRooms(qc),
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
