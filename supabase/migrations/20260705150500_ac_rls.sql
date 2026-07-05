-- =====================================================================
-- [Phase 7] AC 워크스페이스 RLS 일괄 정책
-- 원칙: Default Deny, SELECT/INSERT/UPDATE 분리, DELETE 미선언(soft delete).
-- 내부: app.can_read/write_workspace('ac') (+ program_id 보유 시 program 스코프).
-- 게스트: 'ac' 워크스페이스 권한이 없어 전면 차단(GUEST 세부 스코프는 Phase 13에서 정교화).
-- program_id 없는 자식 테이블은 워크스페이스 게이트로 통제(상위에서 스코프 강제).
-- =====================================================================

do $$
declare
  t         text;
  scope_col text;
  sel_expr  text;
  wr_expr   text;
  ac_tables text[] := array[
    -- core
    'programs','program_modules','program_participants',
    'application_forms','application_form_fields','application_submissions','application_answers',
    -- evaluation
    'evaluation_forms','evaluation_criteria','evaluation_targets','evaluation_assignments',
    'evaluation_submissions','evaluation_answers','document_review_rounds','document_review_snapshots',
    'onsite_eval_sessions','onsite_eval_presentations','selection_results',
    -- engagement
    'orientation_sessions','session_attendees','session_materials','attendance_logs',
    'mentoring_relationships','mentoring_sessions','mentoring_logs',
    'mentor_satisfaction_records','mentor_feedback_records',
    'matching_events','matching_tables','matching_slots','matching_bookings','counseling_logs',
    'demoday_sessions','demoday_presentations','demoday_interests','follow_up_meetings',
    -- ops
    'program_timeline_items','timeline_conflicts','module_kpi_snapshots','outcome_records','export_jobs',
    'custom_activities','activity_minutes','action_items','activity_attachments','activity_attendees'
  ];
begin
  foreach t in array ac_tables loop
    execute format('alter table public.%I enable row level security', t);

    -- 스코프 컬럼 결정: programs는 id, 그 외 program_id 보유 시 사용
    if t = 'programs' then
      scope_col := 'id';
    elsif exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = t and column_name = 'program_id'
    ) then
      scope_col := 'program_id';
    else
      scope_col := null;
    end if;

    if scope_col is not null then
      sel_expr := format('app.can_read_workspace(''ac'') and app.can_access_program(%I)', scope_col);
      wr_expr  := format('app.can_write_workspace(''ac'') and app.can_access_program(%I)', scope_col);
    else
      sel_expr := 'app.can_read_workspace(''ac'')';
      wr_expr  := 'app.can_write_workspace(''ac'')';
    end if;

    execute format('drop policy if exists %I on public.%I', t || '_ac_select', t);
    execute format('create policy %I on public.%I for select using (%s)', t || '_ac_select', t, sel_expr);

    execute format('drop policy if exists %I on public.%I', t || '_ac_insert', t);
    execute format('create policy %I on public.%I for insert with check (%s)', t || '_ac_insert', t, wr_expr);

    execute format('drop policy if exists %I on public.%I', t || '_ac_update', t);
    execute format('create policy %I on public.%I for update using (%s) with check (%s)', t || '_ac_update', t, wr_expr, wr_expr);
  end loop;
end $$;
