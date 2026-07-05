import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Priority, ProjectType, TaskStatus } from '@/features/project/config'

export interface Project {
  id: string
  name: string
  project_type: ProjectType
  priority: Priority
  start_date: string | null
  end_date: string | null
  progress_pct: number
  pm_id: string | null
}

const PROJECT_COLS =
  'id, name, project_type, priority, start_date, end_date, progress_pct, pm_id'

export function useProjects() {
  return useQuery({
    queryKey: ['project', 'list'],
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from('projects')
        .select(PROJECT_COLS)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Project[]
    },
  })
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['project', 'one', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Project | null> => {
      const { data } = await supabase
        .from('projects')
        .select(PROJECT_COLS)
        .eq('id', id)
        .maybeSingle()
      return (data as Project) ?? null
    },
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: {
      name: string
      project_type: ProjectType
      priority: Priority
      start_date: string | null
      end_date: string | null
    }) => {
      const { error } = await supabase.from('projects').insert(values)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', 'list'] }),
  })
}

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  assignee_id: string | null
  due_date: string | null
}

export function useTasks(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', 'tasks', projectId],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<Task[]> => {
      const { data } = await supabase
        .from('project_tasks')
        .select('id, title, description, status, assignee_id, due_date')
        .eq('project_id', projectId)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
      return (data ?? []) as Task[]
    },
  })
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: { title: string; due_date: string | null }) => {
      const { error } = await supabase
        .from('project_tasks')
        .insert({ ...values, project_id: projectId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', 'tasks', projectId] }),
  })
}

export function useUpdateTaskStatus(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await supabase
        .from('project_tasks')
        .update({ status })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', 'tasks', projectId] }),
  })
}

export interface Milestone {
  id: string
  name: string
  start_date: string | null
  end_date: string | null
}

export function useMilestones(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', 'milestones', projectId],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<Milestone[]> => {
      const { data } = await supabase
        .from('project_milestones')
        .select('id, name, start_date, end_date')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })
      return (data ?? []) as Milestone[]
    },
  })
}

export function useCreateMilestone(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: {
      name: string
      start_date: string | null
      end_date: string | null
    }) => {
      const { error } = await supabase
        .from('project_milestones')
        .insert({ ...values, project_id: projectId })
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['project', 'milestones', projectId] }),
  })
}
