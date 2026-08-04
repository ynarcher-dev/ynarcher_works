/**
 * 근태 기록 서버 훅 — 일간·월간 조회, 본인 출퇴근, 관리자 정정.
 *
 * RLS: 조회 app.can_read_workspace('management') 또는 본인, 쓰기 management write뿐이다.
 * 본인 출퇴근은 원장 UPDATE가 아니라 좁은 RPC 두 개로만 통한다(자기 상태를 고칠 수 없게).
 * 근거: supabase/migrations/20260803190000_attendance.sql
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/auth/authStore'
import { supabase } from '@/lib/supabase'
import type {
  AttendanceBoardRow,
  AttendanceDay,
  AttendanceEdit,
  AttendanceMonthRow,
  AttendancePlace,
} from '@/features/management/attendance/attendanceModel'

export const ATTENDANCE_KEY = ['management', 'attendance']

interface EntryRow {
  is_workday: boolean
  day_id: string | null
  work_place: AttendancePlace | null
  check_in_at: string | null
  check_out_at: string | null
  status_code: string | null
  auto_status_code: string | null
  note: string | null
}

const toEntry = (r: EntryRow) => ({
  isWorkday: r.is_workday,
  dayId: r.day_id,
  workPlace: r.work_place,
  checkInAt: r.check_in_at,
  checkOutAt: r.check_out_at,
  statusCode: r.status_code,
  autoStatusCode: r.auto_status_code,
  note: r.note,
})

/** 그날의 전 임직원 근태 한 줄씩. 근무일 판정까지 서버가 붙여 준다. */
export function useAttendanceBoard(dateKey: string) {
  return useQuery({
    queryKey: [...ATTENDANCE_KEY, 'board', dateKey],
    queryFn: async (): Promise<AttendanceBoardRow[]> => {
      const { data, error } = await supabase.rpc('attendance_board', { p_date: dateKey })
      if (error) throw error
      return ((data ?? []) as (EntryRow & {
        user_id: string
        user_name: string
        department_id: string | null
      })[]).map((r) => ({
        ...toEntry(r),
        userId: r.user_id,
        userName: r.user_name,
        departmentId: r.department_id,
      }))
    },
  })
}

/** 한 사람의 기간 근태. 기록이 없는 날도 줄이 선다(결근·휴무를 화면이 그린다). */
export function useAttendanceMonth(userId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: [...ATTENDANCE_KEY, 'month', userId, from, to],
    enabled: Boolean(userId),
    queryFn: async (): Promise<AttendanceMonthRow[]> => {
      const { data, error } = await supabase.rpc('attendance_month', {
        p_user_id: userId,
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      return ((data ?? []) as (EntryRow & { work_date: string })[]).map((r) => ({
        ...toEntry(r),
        workDate: r.work_date,
      }))
    },
  })
}

interface DayRow {
  id: string
  user_id: string
  work_date: string
  work_place: AttendancePlace
  check_in_at: string | null
  check_out_at: string | null
  status_code: string
  auto_status_code: string | null
  note: string | null
}

const toDay = (r: DayRow): AttendanceDay => ({
  id: r.id,
  userId: r.user_id,
  workDate: r.work_date,
  workPlace: r.work_place,
  checkInAt: r.check_in_at,
  checkOutAt: r.check_out_at,
  statusCode: r.status_code,
  autoStatusCode: r.auto_status_code,
  note: r.note,
})

const DAY_COLUMNS =
  'id, user_id, work_date, work_place, check_in_at, check_out_at, status_code, auto_status_code, note'

/** 오늘 내 근태 한 줄(근무체크 위젯). 아직 찍지 않았으면 null. */
export function useMyAttendanceDay(dateKey: string) {
  const userId = useAuthStore((s) => s.user?.id)
  return useQuery({
    queryKey: [...ATTENDANCE_KEY, 'mine', userId, dateKey],
    enabled: Boolean(userId),
    queryFn: async (): Promise<AttendanceDay | null> => {
      const { data, error } = await supabase
        .from('attendance_days')
        .select(DAY_COLUMNS)
        .eq('user_id', userId)
        .eq('work_date', dateKey)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      return data ? toDay(data as DayRow) : null
    },
  })
}

/** 한 행의 정정 이력(최근 순). */
export function useAttendanceEdits(dayId: string | null | undefined) {
  return useQuery({
    queryKey: [...ATTENDANCE_KEY, 'edits', dayId],
    enabled: Boolean(dayId),
    queryFn: async (): Promise<AttendanceEdit[]> => {
      const { data, error } = await supabase
        .from('attendance_edits')
        .select('id, field, before_value, after_value, reason, edited_by_name, edited_at')
        .eq('attendance_day_id', dayId)
        .order('edited_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r) => ({
        id: r.id as string,
        field: r.field as AttendanceEdit['field'],
        beforeValue: r.before_value as string | null,
        afterValue: r.after_value as string | null,
        reason: r.reason as string,
        editedByName: r.edited_by_name as string | null,
        editedAt: r.edited_at as string,
      }))
    },
  })
}

/** 출근·퇴근 찍기. 시각·판정은 서버가 정한다(클라이언트 시계를 신뢰하지 않는다). */
export function useCheckIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (place: AttendancePlace) => {
      const { error } = await supabase.rpc('attendance_check_in', { p_place: place })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ATTENDANCE_KEY }),
  })
}

export function useCheckOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('attendance_check_out')
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ATTENDANCE_KEY }),
  })
}

/** 관리자 정정 입력. 사유는 비울 수 없다(DB가 최종 판정한다). */
export interface AttendanceRecordInput {
  userId: string
  workDate: string
  statusCode: string
  checkInAt: string | null
  checkOutAt: string | null
  workPlace: AttendancePlace
  note: string | null
  reason: string
}

/** 일괄 변경 대상 한 칸(누구의 어느 날인가). 날짜별은 한 날짜에 여러 사람, 인력별은 그 반대다. */
export interface AttendanceBulkTarget {
  userId: string
  workDate: string
}

/**
 * 상태 일괄 변경 — 고른 칸들의 상태 하나만 바꾼다. 반환값은 실제로 바뀐 건수다.
 *
 * set_attendance_record를 여러 번 부르지 않는다. 12건 중 5건에서 끊기면 어느 것이 반영됐는지
 * 화면이 답할 수 없고, 그 RPC는 시각·근무지·비고까지 함께 덮어써서 호출부가 화면이 읽은(낡았을
 * 수 있는) 값을 되돌려 보내야 한다. 일괄 RPC는 상태만 바꾸고 나머지는 원장 값 그대로 둔다.
 * 근거: supabase/migrations/20260804100000_attendance_bulk_status.sql
 */
export function useSetAttendanceStatusBulk() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      targets: AttendanceBulkTarget[]
      statusCode: string
      reason: string
    }): Promise<number> => {
      const { data, error } = await supabase.rpc('set_attendance_status_bulk', {
        p_user_ids: v.targets.map((t) => t.userId),
        p_work_dates: v.targets.map((t) => t.workDate),
        p_status: v.statusCode,
        p_reason: v.reason,
      })
      if (error) throw error
      return (data ?? 0) as number
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ATTENDANCE_KEY }),
  })
}

/** 근태 정정 — 원장 수정과 이력 기록을 한 트랜잭션으로 묶는 RPC 경유. */
export function useSetAttendanceRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: AttendanceRecordInput) => {
      const { error } = await supabase.rpc('set_attendance_record', {
        p_user_id: v.userId,
        p_work_date: v.workDate,
        p_status: v.statusCode,
        p_check_in: v.checkInAt,
        p_check_out: v.checkOutAt,
        p_place: v.workPlace,
        p_note: v.note,
        p_reason: v.reason,
      })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ATTENDANCE_KEY }),
  })
}
