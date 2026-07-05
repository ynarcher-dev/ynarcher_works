import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Program {
  id: string
  title: string
  status: string
  start_date: string | null
  end_date: string | null
}

export function usePrograms() {
  return useQuery({
    queryKey: ['ac', 'programs'],
    queryFn: async (): Promise<Program[]> => {
      const { data, error } = await supabase
        .from('programs')
        .select('id, title, status, start_date, end_date')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Program[]
    },
  })
}

export function useProgram(id: string | undefined) {
  return useQuery({
    queryKey: ['ac', 'program', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Program | null> => {
      const { data } = await supabase
        .from('programs')
        .select('id, title, status, start_date, end_date')
        .eq('id', id)
        .maybeSingle()
      return (data as Program) ?? null
    },
  })
}

export function useCreateProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: { title: string; status: string }) => {
      const { error } = await supabase.from('programs').insert(values)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ac', 'programs'] }),
  })
}

export interface ProgramModule {
  id: string
  module_type: string
  enabled: boolean
  participation_mode: string | null
}

export function useProgramModules(programId: string | undefined) {
  return useQuery({
    queryKey: ['ac', 'modules', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<ProgramModule[]> => {
      const { data } = await supabase
        .from('program_modules')
        .select('id, module_type, enabled, participation_mode')
        .eq('program_id', programId)
      return (data ?? []) as ProgramModule[]
    },
  })
}

export function useToggleModule(programId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      moduleType: string
      enabled: boolean
      participationMode?: string | null
    }) => {
      const { error } = await supabase.from('program_modules').upsert(
        {
          program_id: programId,
          module_type: input.moduleType,
          enabled: input.enabled,
          participation_mode: input.participationMode ?? null,
          status: input.enabled ? 'OPEN' : 'CLOSED',
        },
        { onConflict: 'program_id,module_type' },
      )
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['ac', 'modules', programId] }),
  })
}

export interface MentoringRelationship {
  id: string
  startup_id: string | null
  mentor_participant_id: string | null
  status: string
}

/** 프로그램의 멘토링 관계 목록(MENTORING 모듈 기준). */
export function useMentoringRelationships(programId: string | undefined) {
  return useQuery({
    queryKey: ['ac', 'mentoring', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<MentoringRelationship[]> => {
      const { data: mod } = await supabase
        .from('program_modules')
        .select('id')
        .eq('program_id', programId)
        .eq('module_type', 'MENTORING')
        .maybeSingle()
      if (!mod) return []
      const { data } = await supabase
        .from('mentoring_relationships')
        .select('id, startup_id, mentor_participant_id, status')
        .eq('program_module_id', (mod as { id: string }).id)
      return (data ?? []) as MentoringRelationship[]
    },
  })
}

export interface Participant {
  id: string
  role: string
  status: string
  user_id: string | null
}

export function useParticipants(programId: string | undefined) {
  return useQuery({
    queryKey: ['ac', 'participants', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<Participant[]> => {
      const { data } = await supabase
        .from('program_participants')
        .select('id, role, status, user_id')
        .eq('program_id', programId)
        .order('role', { ascending: true })
      return (data ?? []) as Participant[]
    },
  })
}
