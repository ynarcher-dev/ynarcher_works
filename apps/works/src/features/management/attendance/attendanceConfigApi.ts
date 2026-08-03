/**
 * 근태 기준정보 서버 훅 — 근무 정책(attendance_policies)과 상태 원장(attendance_statuses).
 *
 * 상태 원장은 내부 사용자 전원이 읽는다(근무체크 위젯도 라벨·톤이 필요하다). 쓰기는 둘 다
 * management write이며, 어떤 기준이 적용되는지의 해석은 DB(app.resolve_attendance_policy)가
 * 갖는다 — 본인에게 적용될 한 벌은 my_attendance_policy RPC로 받는다.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ATTENDANCE_KEY } from '@/features/management/attendance/attendanceApi'
import type {
  AttendanceKind,
  AttendancePolicy,
  AttendanceStatus,
} from '@/features/management/attendance/attendanceModel'
import type { BadgeTone } from '@ynarcher/ui'

const CONFIG_KEY = ['management', 'attendance-config']

interface StatusRow {
  code: string
  label: string
  tone: BadgeTone
  kind: AttendanceKind
  is_system: boolean
  is_paid: boolean
  sort_order: number
  is_active: boolean
}

const toStatus = (r: StatusRow): AttendanceStatus => ({
  code: r.code,
  label: r.label,
  tone: r.tone,
  kind: r.kind,
  isSystem: r.is_system,
  isPaid: r.is_paid,
  sortOrder: r.sort_order,
  isActive: r.is_active,
})

/** 근태 상태 원장 전체(비활성 포함 — 지난 기록이 그 코드를 쓰고 있을 수 있다). */
export function useAttendanceStatuses() {
  return useQuery({
    queryKey: [...CONFIG_KEY, 'statuses'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AttendanceStatus[]> => {
      const { data, error } = await supabase
        .from('attendance_statuses')
        .select('code, label, tone, kind, is_system, is_paid, sort_order, is_active')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r) => toStatus(r as StatusRow))
    },
  })
}

export interface AttendanceStatusInput {
  code: string
  label: string
  tone: BadgeTone
  kind: AttendanceKind
  isPaid: boolean
  sortOrder: number
  isActive: boolean
}

/** 상태 추가·수정. 시스템 상태는 코드·구분을 바꿀 수 없어 화면이 그 칸을 잠근다. */
export function useSaveAttendanceStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: AttendanceStatusInput) => {
      const { error } = await supabase.from('attendance_statuses').upsert(
        {
          code: v.code.trim().toUpperCase(),
          label: v.label.trim(),
          tone: v.tone,
          kind: v.kind,
          is_paid: v.isPaid,
          sort_order: v.sortOrder,
          is_active: v.isActive,
        },
        { onConflict: 'code' },
      )
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: CONFIG_KEY }),
  })
}

interface PolicyRow {
  id: string
  user_id: string | null
  check_in_from: string
  check_in_to: string
  work_minutes: number
  workdays: number[]
  allow_external: boolean
  effective_from: string
  note: string | null
}

const toPolicy = (r: PolicyRow): AttendancePolicy => ({
  id: r.id,
  userId: r.user_id,
  checkInFrom: r.check_in_from,
  checkInTo: r.check_in_to,
  workMinutes: r.work_minutes,
  workdays: r.workdays ?? [],
  allowExternal: r.allow_external,
  effectiveFrom: r.effective_from,
  note: r.note,
})

const POLICY_COLUMNS =
  'id, user_id, check_in_from, check_in_to, work_minutes, workdays, allow_external, effective_from, note'

/** 근무 정책 전체(전사 기본 + 임직원별 예외). 발효일 최신이 앞에 온다. */
export function useAttendancePolicies() {
  return useQuery({
    queryKey: [...CONFIG_KEY, 'policies'],
    queryFn: async (): Promise<AttendancePolicy[]> => {
      const { data, error } = await supabase
        .from('attendance_policies')
        .select(POLICY_COLUMNS)
        .is('deleted_at', null)
        .order('effective_from', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r) => toPolicy(r as PolicyRow))
    },
  })
}

/** 나에게 적용되는 기준 한 벌. 위젯이 근무일·출근 가능 시각·외부근무 허용을 이 값으로 판단한다. */
export function useMyAttendancePolicy() {
  return useQuery({
    queryKey: [...CONFIG_KEY, 'mine'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AttendancePolicy | null> => {
      const { data, error } = await supabase.rpc('my_attendance_policy')
      if (error) throw error
      return data ? toPolicy(data as PolicyRow) : null
    },
  })
}

export interface AttendancePolicyInput {
  id?: string
  userId: string | null
  checkInFrom: string
  checkInTo: string
  workMinutes: number
  workdays: number[]
  allowExternal: boolean
  effectiveFrom: string
  note: string | null
}

/**
 * 근무 기준 저장. 발효일이 곧 행의 정체성이라, 같은 대상·같은 발효일이면 그 행을 고치고
 * 발효일이 달라지면 새 행이 선다(과거 판정을 되돌리지 않는다 — DB 유니크 인덱스가 짝을 이룬다).
 */
export function useSaveAttendancePolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: AttendancePolicyInput) => {
      const payload = {
        user_id: v.userId,
        check_in_from: v.checkInFrom,
        check_in_to: v.checkInTo,
        work_minutes: v.workMinutes,
        workdays: v.workdays,
        allow_external: v.allowExternal,
        effective_from: v.effectiveFrom,
        note: v.note?.trim() || null,
      }
      const { error } = v.id
        ? await supabase.from('attendance_policies').update(payload).eq('id', v.id)
        : await supabase.from('attendance_policies').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CONFIG_KEY })
      void qc.invalidateQueries({ queryKey: ATTENDANCE_KEY })
    },
  })
}

/** 임직원 예외 해제(soft delete). 전사 기본은 지우지 않는다 — 지우면 판정할 기준이 사라진다. */
export function useDeleteAttendancePolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('attendance_policies')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .not('user_id', 'is', null)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CONFIG_KEY })
      void qc.invalidateQueries({ queryKey: ATTENDANCE_KEY })
    },
  })
}
