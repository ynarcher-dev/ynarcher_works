import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ProgramManagerRole } from '@/features/program/hooks'
import type { ProgramWorkspaceConfig } from '@/features/program/workspace'

/**
 * 기업 상세의 '참여 사업/M&A/프로젝트' 한 줄 — **지금 이 기업이 걸려 있는 사업**이다.
 *
 * 담는 것은 참가자 원장에 행이 선 건, 즉 선정되어 실제로 참여 중인 건뿐이다. 지원했다가
 * 선정되지 않은 이력(AC의 application_submissions)은 여기 오지 않는다 — 한 표에 섞으면
 * 카드 제목 옆의 건수가 '참여'를 센 것인지 '접촉'을 센 것인지 답할 수 없게 된다.
 *
 * 중도 이탈 여부(participants.status)도 열로 세우지 않는다. 이 표가 답하는 물음은 "지금
 * 연동되어 있는가" 하나이므로, 상태를 추적하는 축은 사업 자체의 상태 하나로 족하다.
 */
export interface StartupProgramRow {
  id: string
  code: string | null
  category: string | null
  title: string
  status: string
  start_date: string | null
  end_date: string | null
  /** 참여 성격 태그(수혜기업·멘티 등). 미지정은 빈 배열. */
  roleTags: string[]
  /** 이 사업에 배정된 우리 담당자(기간 세그먼트라 한 사람이 여러 행일 수 있다). */
  managers: { user_id: string; role: ProgramManagerRole; user: { name: string | null } | null }[]
}

interface ParticipantRow {
  program_id: string
  role_tags: string[] | null
}

/** 참여한 사업 본체 select. 카드 표가 그리는 열만 읽는다(부서·분야·설명은 사업 상세가 답한다). */
function programCols(config: ProgramWorkspaceConfig): string {
  const { managers } = config.tables
  return (
    'id, code, category, title, status, start_date, end_date, ' +
    `managers:${managers}(user_id, role, user:users!${managers}_user_id_fkey(name))`
  )
}

/**
 * 한 기업이 참여 중인 사업 목록(워크스페이스 1종).
 *
 * 두 번 조회하는 이유는 `master_id`가 FK가 아닌 soft ref라 PostgREST 임베드로 사업 본체를
 * 함께 끌어올 수 없기 때문이다(사업 상세의 참가자 풀이 마스터 이름을 따로 읽는 것과 같은 축).
 *
 * 열람 권한이 없는 워크스페이스는 RLS가 참가자 행부터 막으므로 빈 목록이 온다 — 화면은
 * 그것을 '참여 없음'이 아니라 '볼 수 없음'으로 구분해 말해야 한다(StartupProgramCard 참조).
 */
export function useStartupPrograms(config: ProgramWorkspaceConfig, startupId: string | undefined) {
  return useQuery({
    queryKey: [config.key, 'startup-programs', startupId],
    enabled: Boolean(startupId),
    queryFn: async (): Promise<StartupProgramRow[]> => {
      const { data: partData, error: partError } = await supabase
        .from(config.tables.participants)
        .select('program_id, role_tags')
        .eq('master_id', startupId)
        .eq('role', 'STARTUP')
      if (partError) throw partError

      const participants = (partData ?? []) as ParticipantRow[]
      const ids = [...new Set(participants.map((p) => p.program_id))]
      if (ids.length === 0) return []

      const { data: programData, error: programError } = await supabase
        .from(config.tables.programs)
        .select(programCols(config))
        .in('id', ids)
        .is('deleted_at', null)
      if (programError) throw programError

      // 같은 사업에 참가 행이 둘 이상일 수 있어(성격 태그를 나눠 단 경우) 사업 단위로 접는다.
      const byProgram = new Map<string, ParticipantRow[]>()
      participants.forEach((p) =>
        byProgram.set(p.program_id, [...(byProgram.get(p.program_id) ?? []), p]),
      )

      type ProgramRow = Omit<StartupProgramRow, 'roleTags'>
      return ((programData ?? []) as unknown as ProgramRow[])
        .map((program): StartupProgramRow => ({
          ...program,
          managers: program.managers ?? [],
          roleTags: [...new Set((byProgram.get(program.id) ?? []).flatMap((r) => r.role_tags ?? []))],
        }))
        .sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''))
    },
  })
}
