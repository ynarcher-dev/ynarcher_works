import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { supabase } from '@/lib/supabase'
import { normalizeTime, type ReservationSpan } from '@/features/office/rooms/availability'

/**
 * 회의실 예약 서버 훅. 조회는 내부 사용자 전원(가용성 확인), 생성은 본인 예약만,
 * 취소는 본인·admin(RLS). 원장: supabase/migrations/20260728120000_meeting_rooms.sql.
 */

export interface Reservation {
  id: string
  roomId: string
  reservedDate: string
  startTime: string
  endTime: string
  createdBy: string
  createdByName: string | null
}

interface ReservationRow {
  id: string
  room_id: string
  reserved_date: string
  start_time: string
  end_time: string
  created_by: string
  created_by_name: string | null
}

const toReservation = (r: ReservationRow): Reservation => ({
  id: r.id,
  roomId: r.room_id,
  reservedDate: r.reserved_date,
  startTime: normalizeTime(r.start_time),
  endTime: normalizeTime(r.end_time),
  createdBy: r.created_by,
  createdByName: r.created_by_name,
})

/** 예약 목록 → availability 계산용 시간대(span) 배열. */
export const toSpans = (rs: Reservation[]): ReservationSpan[] =>
  rs.map((r) => ({ start: r.startTime, end: r.endTime }))

const dayKey = (roomIds: string[], date: string) => [
  'office',
  'meeting-reservations',
  date,
  [...roomIds].sort().join(','),
]

/** 지점의 여러 회의실 × 특정 날짜의 유효 예약(취소 제외). 시간 오름차순. */
export function useDayReservations(roomIds: string[], date: string) {
  return useQuery({
    queryKey: dayKey(roomIds, date),
    enabled: roomIds.length > 0 && Boolean(date),
    queryFn: async (): Promise<Reservation[]> => {
      const { data, error } = await supabase
        .from('meeting_room_reservations')
        .select('id, room_id, reserved_date, start_time, end_time, created_by, created_by_name')
        .in('room_id', roomIds)
        .eq('reserved_date', date)
        .is('deleted_at', null)
        .order('start_time', { ascending: true })
      if (error) throw error
      return ((data ?? []) as ReservationRow[]).map(toReservation)
    },
  })
}

// ── 예약자 검색 ──────────────────────────────────────────────────────

/** 예약자 검색 결과 1건(회의실·지점을 함께 실어 화면 이동에 쓴다). */
export interface ReservationHit {
  id: string
  roomId: string
  roomName: string
  placeId: string
  reservedDate: string
  startTime: string
  endTime: string
  reserverName: string
}

interface HitRow {
  id: string
  room_id: string
  reserved_date: string
  start_time: string
  end_time: string
  created_by_name: string | null
  meeting_rooms: { name: string; place_id: string } | null
}

/** PostgREST 필터 값에서 문법 제어문자를 걷어낸다(networkPeopleSearch와 동일 처리). */
function sanitizeFilterValue(v: string): string {
  return v.replace(/[(),*%]/g, ' ').trim()
}

/**
 * 예약자명으로 오늘 이후(오늘 포함) 예약을 찾는다 — "누가 언제 어느 회의실을 잡아뒀나".
 * 이름은 원장의 비정규화 컬럼(created_by_name, 서버 트리거 스탬프)으로 매칭한다.
 * users를 직접 조회하지 않으므로 users RLS와 무관하게 동작한다.
 */
export function useReservationSearch(keyword: string) {
  const q = sanitizeFilterValue(keyword)
  return useQuery({
    queryKey: ['office', 'meeting-reservation-search', q],
    enabled: q.length > 0,
    queryFn: async (): Promise<ReservationHit[]> => {
      const { data, error } = await supabase
        .from('meeting_room_reservations')
        .select(
          'id, room_id, reserved_date, start_time, end_time, created_by_name, ' +
            'meeting_rooms!inner(name, place_id)',
        )
        .is('deleted_at', null)
        .gte('reserved_date', dayjs().format('YYYY-MM-DD'))
        .ilike('created_by_name', `%${q}%`)
        .order('reserved_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(30)
      if (error) throw error
      return ((data ?? []) as unknown as HitRow[]).map((r) => ({
        id: r.id,
        roomId: r.room_id,
        roomName: r.meeting_rooms?.name ?? '',
        placeId: r.meeting_rooms?.place_id ?? '',
        reservedDate: r.reserved_date,
        startTime: normalizeTime(r.start_time),
        endTime: normalizeTime(r.end_time),
        reserverName: r.created_by_name ?? '',
      }))
    },
  })
}

/** 예약 생성. created_by는 서버 트리거가 스탬프한다(클라이언트 미전송). */
export function useCreateReservation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { roomId: string; date: string; startTime: string; endTime: string }) => {
      const { error } = await supabase.from('meeting_room_reservations').insert({
        room_id: v.roomId,
        reserved_date: v.date,
        start_time: v.startTime,
        end_time: v.endTime,
      })
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['office', 'meeting-reservations'] }),
  })
}

/** 예약 취소(soft). deleted_at·cancelled_by·cancelled_at 세팅. */
export function useCancelReservation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; cancelledBy: string }) => {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('meeting_room_reservations')
        .update({ deleted_at: now, cancelled_at: now, cancelled_by: v.cancelledBy })
        .eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['office', 'meeting-reservations'] }),
  })
}

/** 예약 겹침(EXCLUDE 위반) 오류인지 판별해 친절한 안내로 매핑하기 위한 헬퍼. */
export function isOverlapError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  return e?.code === '23P01' || Boolean(e?.message?.includes('meeting_reservations_no_overlap'))
}
