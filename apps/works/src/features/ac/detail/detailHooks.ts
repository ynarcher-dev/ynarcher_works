import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { defaultParticipationMode } from '@/features/ac/config'
import type { ModuleSettings } from '@/features/ac/detail/moduleMeta'
import { recordProgramContribution } from '@/features/ac/detail/programContributions'

/** 프로그램 마스터 수정(제목/상태/기간/설명 — 편집 모달용). */
export function useUpdateProgram(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: {
      title: string
      status: string
      proposal_start_date: string | null
      proposal_end_date: string | null
      start_date: string | null
      end_date: string | null
      description: string | null
    }) => {
      const { error } = await supabase.from('programs').update(values).eq('id', id)
      if (error) throw error
      // 변동 이력 'edited' 기록(부수 기록: 실패해도 수정은 성공 처리).
      await recordProgramContribution(id, 'edited').catch(() => {})
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ac', 'program', id] })
      void qc.invalidateQueries({ queryKey: ['ac', 'programs'] })
      void qc.invalidateQueries({ queryKey: ['ac', 'contributions', id] })
    },
  })
}

/** 모듈 운영 설정 저장: 상태/참여방식 컬럼 + settings(jsonb) 일정·메모 병합. */
export function useUpdateModuleSettings(programId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      moduleType: string
      status: string
      participationMode: string | null
      /** 공유 범위(module_visibility): INTERNAL_ONLY/GUEST_ONLY/PUBLIC. */
      visibility: string
      /** 기존 settings 원본(다른 키 보존을 위해 병합 기준으로 사용). */
      currentSettings: Record<string, unknown>
      settings: ModuleSettings
    }) => {
      const { error } = await supabase.from('program_modules').upsert(
        {
          program_id: programId,
          module_type: input.moduleType,
          enabled: true,
          status: input.status,
          participation_mode: input.participationMode,
          visibility: input.visibility,
          settings: { ...input.currentSettings, ...input.settings },
        },
        { onConflict: 'program_id,module_type' },
      )
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['ac', 'modules', programId] }),
  })
}

/** 모듈 일괄 활성화(+ 모듈 추가 모달). 기존 행의 settings 등은 건드리지 않는다. */
export function useEnableModules(programId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (moduleTypes: string[]) => {
      // 배정 방식은 사용자 입력이 아니라 모듈 타입별 기본값으로 강제 지정한다.
      const { error } = await supabase.from('program_modules').upsert(
        moduleTypes.map((module_type) => ({
          program_id: programId,
          module_type,
          enabled: true,
          participation_mode: defaultParticipationMode(module_type),
        })),
        { onConflict: 'program_id,module_type' },
      )
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['ac', 'modules', programId] }),
  })
}

export interface TimelineItem {
  id: string
  title: string
  item_type: string | null
  starts_at: string | null
  ends_at: string | null
  program_module_id: string | null
}

/** 프로그램 통합 타임라인 아이템(모든 모듈 세션의 정규화 인덱스). */
export function useTimelineItems(programId: string | undefined) {
  return useQuery({
    queryKey: ['ac', 'timeline', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<TimelineItem[]> => {
      const { data } = await supabase
        .from('program_timeline_items')
        .select('id, title, item_type, starts_at, ends_at, program_module_id')
        .eq('program_id', programId)
        .order('starts_at', { ascending: true })
      return (data ?? []) as TimelineItem[]
    },
  })
}

export interface PoolMember {
  id: string
  role: string
  status: string
  /** 마스터(스타트업/전문가) 또는 연결 계정 이름. */
  name: string
  /** 보조 정보: 대표자명(스타트업)·소속(전문가) 등. */
  detail: string
  email: string
  linked: boolean
}

interface ParticipantRow {
  id: string
  role: string
  status: string
  user_id: string | null
  master_id: string | null
  user: { name: string; email: string | null } | null
}

const EXPERT_ROLES = ['EXPERT', 'MENTOR', 'JUDGE']

/** 참가자 풀(마스터·계정 이름 합성). NETWORKS 마스터는 soft ref라 별도 조회로 조인한다. */
export function useParticipantPool(programId: string | undefined) {
  return useQuery({
    queryKey: ['ac', 'participant-pool', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<PoolMember[]> => {
      const { data } = await supabase
        .from('program_participants')
        .select('id, role, status, user_id, master_id, user:users(name, email)')
        .eq('program_id', programId)
        .order('created_at', { ascending: true })
      const rows = (data ?? []) as unknown as ParticipantRow[]

      const startupIds = rows
        .filter((r) => r.role === 'STARTUP' && r.master_id)
        .map((r) => r.master_id as string)
      const expertIds = rows
        .filter((r) => EXPERT_ROLES.includes(r.role) && r.master_id)
        .map((r) => r.master_id as string)

      const [startupsRes, expertsRes] = await Promise.all([
        startupIds.length
          ? supabase.from('startups').select('id, name, representative').in('id', startupIds)
          : Promise.resolve({ data: [] }),
        expertIds.length
          ? supabase.from('experts').select('id, name, affiliation, email').in('id', expertIds)
          : Promise.resolve({ data: [] }),
      ])
      const startups = new Map(
        ((startupsRes.data ?? []) as { id: string; name: string; representative: string | null }[]).map(
          (s) => [s.id, s],
        ),
      )
      const experts = new Map(
        ((expertsRes.data ?? []) as { id: string; name: string; affiliation: string | null; email: string | null }[]).map(
          (e) => [e.id, e],
        ),
      )

      return rows.map((r) => {
        const startup = r.master_id ? startups.get(r.master_id) : undefined
        const expert = r.master_id ? experts.get(r.master_id) : undefined
        return {
          id: r.id,
          role: r.role,
          status: r.status,
          name: startup?.name ?? expert?.name ?? r.user?.name ?? '미지정',
          detail: startup?.representative ?? expert?.affiliation ?? '',
          email: r.user?.email ?? expert?.email ?? '',
          linked: r.user_id != null,
        }
      })
    },
  })
}
