import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useGuestHost } from '@/features/guest/host'

/**
 * 참가자 명부의 **문**(門) — 여닫고, 막고, 열쇠를 다시 보내고, 기간을 정한다.
 *
 * 명부 조회·추가(`participantHooks`)와 갈라 둔 것은 줄 수 때문이 아니라 **축이 다르기**
 * 때문이다(3_9_1 §3). 저쪽은 "이 사업에 누가 있는가"를 답하고 이쪽은 "그 사람이 지금
 * 들어올 수 있는가"를 바꾼다 — 담는 일은 후보를 쌓는 일이라 아무 담당자나 하지만, 여는 일은
 * 그 사업의 PM·MEMBER만 하고 그 강제는 전부 서버(RPC·Edge Function)가 진다.
 */

export interface OpenAccessResult {
  opened: number
  notified: number
  failed: number
}

/**
 * 게스트 로그인 개방 + 접속 안내 발송. 인가(사업 담당자 여부)는 서버 RPC가 지며,
 * 함수는 그 결과로 받은 연락처로만 안내를 보낸다.
 */
export function useOpenGuestAccess(programId: string) {
  const config = useGuestHost()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (participantIds: string[]): Promise<OpenAccessResult> => {
      const { data, error } = await supabase.functions.invoke<OpenAccessResult & { message?: string }>(
        'guest-access-invite',
        { body: { participantIds } },
      )
      if (error) throw new Error(data?.message ?? error.message)
      return { opened: data?.opened ?? 0, notified: data?.notified ?? 0, failed: data?.failed ?? 0 }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [config.key, 'participants', programId] })
    },
  })
}

/**
 * 비밀번호 **재설정 안내 발송**. 종전의 '초기화'를 대체한다(2026-09-05).
 *
 * 담당자가 값을 되돌리는 경로를 두지 않는 이유: 계정이 대상 단위가 되면서 한 계정이 여러
 * 사업을 열게 되었고, 값을 쥔 사람은 그 게스트가 참여 중인 **다른 팀 사업까지** 들어갈 수
 * 있다. 링크는 게스트 본인 연락처로만 나가고 호출자 화면에는 아무 값도 오지 않는다.
 */
export function useSendPasswordReset() {
  return useMutation({
    mutationFn: async (userId: string): Promise<{ notified: boolean }> => {
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean
        notified?: boolean
        message?: string
      }>('guest-password-reset', { body: { userId } })
      if (error) throw new Error(data?.message ?? error.message)
      return { notified: Boolean(data?.notified) }
    },
  })
}

/**
 * 이 사업 게스트의 접근 종료일 설정(2026-09-05 사업 단위로 올라왔다).
 *
 * 기간은 사업의 사실이지 기업의 사실이 아니다 — 참여 기업이 스무 곳이면 종전 구조는 같은
 * 값을 스무 번 적게 했고, 그 스무 값이 어긋날 수 있다는 것 자체가 결함이었다. 기업 한 곳만
 * 막을 일은 기간이 아니라 **차단**이 답한다(3_9_1 §8).
 *
 * 사업 원장 값이 바뀌므로 명부만이 아니라 사업 조회도 함께 무효화한다.
 */
export function useSetProgramAccessWindow(programId: string) {
  const config = useGuestHost()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ends: string | null): Promise<void> => {
      const { error } = await supabase.rpc('set_program_guest_access_window', {
        p_program_id: programId,
        p_ends: ends,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [config.key, 'participants', programId] })
      void qc.invalidateQueries({ queryKey: [config.key, 'program', programId] })
      void qc.invalidateQueries({ queryKey: [config.key, 'programs'] })
    },
  })
}

/**
 * 차단 해제 — 닫은 문을 다시 연다.
 *
 * 되돌릴 상태를 화면이 정하지 않는다. 서버가 원장에 되묻는다 — 이 사업에 들어와 본 적이
 * 있으면(`joined_at`) 이용 중, 없으면 초대다. 차단 직전 값을 어딘가에 적어 두는 방법은
 * 쓰지 않는다(사본은 어긋난다 — 막아 둔 사이에 기간이 지나면 적어 둔 '이용 중'은 거짓이다).
 *
 * `로그인 열기`와 다른 점은 **안내를 보내지 않는다**는 것이다. 막은 적 있다는 사실을 굳이
 * 알리지 않고 되돌리는 길이며, 다시 알려야 하면 `로그인 열기`를 쓴다.
 */
export function useReopenGuestAccess(programId: string) {
  const config = useGuestHost()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (participantIds: string[]): Promise<number> => {
      const { data, error } = await supabase.rpc('reopen_program_guest_access', {
        p_participant_ids: participantIds,
      })
      if (error) throw error
      return (data as number | null) ?? 0
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [config.key, 'participants', programId] })
    },
  })
}

/** 게스트 로그인 차단(접속 중인 세션까지 즉시 무효화). */
export function useCloseGuestAccess(programId: string) {
  const config = useGuestHost()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (participantIds: string[]): Promise<number> => {
      const { data, error } = await supabase.rpc('close_program_guest_access', {
        p_participant_ids: participantIds,
      })
      if (error) throw error
      return (data as number | null) ?? 0
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [config.key, 'participants', programId] })
    },
  })
}

/** 명부 행을 뺐을 때 남는 기록 한 종류. 건수가 0인 종류는 서버가 보내지 않는다. */
export interface RemovalResidual {
  kind: string
  label: string
  n: number
}

/**
 * 뺄 때 남는 기록의 건수 — **삭제창이 열릴 때만** 묻는다.
 *
 * 선택이 바뀔 때마다 세지 않는 이유는 이 값이 결정에 쓰이는 자리가 삭제창 하나뿐이기
 * 때문이다. 선택 줄에 상시로 세우면 고를 때마다 왕복이 늘고, 정작 읽어야 할 순간에는
 * 이미 화면에 있던 숫자라 눈에 걸리지 않는다.
 */
export function useRemovalPreview(programId: string, participantIds: string[], enabled: boolean) {
  const config = useGuestHost()
  return useQuery({
    queryKey: [config.key, 'removal-preview', programId, [...participantIds].sort()],
    enabled: enabled && participantIds.length > 0,
    queryFn: async (): Promise<RemovalResidual[]> => {
      const { data, error } = await supabase.rpc('program_participant_removal_preview', {
        p_participant_ids: participantIds,
      })
      if (error) throw error
      return ((data ?? []) as { kind: string; label: string; n: number | string }[]).map((r) => ({
        kind: r.kind,
        label: r.label,
        n: Number(r.n),
      }))
    },
  })
}

/**
 * 명부 행을 그 사업에서 **뺀다**(되돌릴 수 없다).
 *
 * 차단(`useCloseGuestAccess`)과 다른 축이다 — 저쪽은 문을 닫아 두는 일이라 되돌릴 수 있고,
 * 이쪽은 "이 사업에 담은 적이 없다"로 만드는 일이다. 잘못 담은 줄이 '차단됨'으로 명부에
 * 남으면 목록이 사실을 말하지 못한다.
 *
 * 계정·비밀번호·다른 사업의 줄은 그대로다. 지원서·질문·자료도 지우지 않는다 — 그 기록이
 * 누구 것인지는 계정이 답한다. 무엇이 남는지는 `useRemovalPreview`가 삭제 전에 밝힌다.
 */
export function useRemoveParticipants(programId: string) {
  const config = useGuestHost()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (participantIds: string[]): Promise<number> => {
      const { data, error } = await supabase.rpc('remove_program_participants', {
        p_participant_ids: participantIds,
      })
      if (error) throw error
      return (data as number | null) ?? 0
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [config.key, 'participants', programId] })
    },
  })
}
