begin;
select plan(5);

select is(
  (select count(*)::int from pg_tables
    where schemaname = 'public'
      and tablename in ('meeting_recordings', 'meeting_recording_segments')
      and rowsecurity),
  2,
  '회의 녹음 두 원장 모두 RLS가 켜져 있다'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('meeting_recordings', 'meeting_recording_segments')
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  0,
  'authenticated는 녹음 원장을 직접 변경할 수 없다'
);
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'start_meeting_recording', 'prepare_meeting_recording_segment',
        'complete_meeting_recording_segment', 'finish_meeting_recording',
        'attach_meeting_recording', 'complete_meeting_recording'
      )
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  6,
  '녹음 상태 전이 RPC만 authenticated에 열려 있다'
);
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'start_meeting_recording', 'prepare_meeting_recording_segment',
        'complete_meeting_recording_segment', 'finish_meeting_recording',
        'attach_meeting_recording', 'complete_meeting_recording'
      )
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('service_role', p.oid, 'EXECUTE'))),
  0,
  '녹음 상태 전이 RPC는 anon/service_role에 열려 있지 않다'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'meeting_recordings_objects_%'
      and cmd <> 'INSERT'),
  0,
  '녹음 Storage에는 직접 조회·수정·삭제 정책이 없다'
);

select * from finish();
rollback;
