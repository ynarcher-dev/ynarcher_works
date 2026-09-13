-- =====================================================================
-- 회의 녹음(meeting_recordings / meeting_recording_segments) 접근 동작 회귀
--
-- 역할 분담
--   · meeting_recording_security_test.sql — 카탈로그 기준의 정적 구조(RLS on, grant, 정책 유무)
--   · 이 파일 — 실제 행·역할·RPC 호출로 "누가 무엇을 할 수 있는가"를 확인한다.
--
-- 허용 범위의 근거(정책을 여기서 새로 정하지 않는다)
--   20260912012905_meeting_recording_sessions.sql
--     · 머리 주석: "접근 주체: 녹음 소유자, 연결된 회의록 열람자"
--     · app.can_read_recording = 소유자 OR (연결된 회의록이 있고 app.can_read_minute)
--     · app.can_write_recording = office write AND 소유자
--   20260903250000_minute_read_excludes_deleted.sql — app.can_read_minute 현행 정의
--   apps/works/.../recordingApi.ts listRecordings() — 회의록 상세에서 minute_id로 목록을 읽는다
--   → 따라서 "회의록에 연결된 녹음이 그 회의록 열람자에게 보이는 것"은 결함이 아니라
--     승인된 공유 경로다. 이 테스트는 그 경로를 **허용으로 단언**하고,
--     연결되지 않은 녹음만 소유자에게 갇히는지 확인한다.
-- =====================================================================
begin;
select plan(43);

-- ── 픽스처 (슈퍼유저로 삽입, 트랜잭션 롤백으로 정리) ───────────────────
insert into public.users (id, user_type, name, session_version) values
  ('d3000000-0000-0000-0000-000000000001', 'management_support', '녹음 소유자',      1),
  ('d3000000-0000-0000-0000-000000000002', 'management_support', '다른 녹음 소유자', 1),
  ('d3000000-0000-0000-0000-000000000003', 'ac_business',        'OFFICE 열람자',    1),
  ('d3000000-0000-0000-0000-000000000004', 'ac_business',        '무권한 임직원',    1);

insert into public.workspace_permissions
  (user_id, workspace_key, permission_level, scope_type, expires_at)
values
  ('d3000000-0000-0000-0000-000000000001', 'office', 'write', 'global', null),
  ('d3000000-0000-0000-0000-000000000002', 'office', 'write', 'global', null),
  ('d3000000-0000-0000-0000-000000000003', 'office', 'read',  'global', null);

-- 회의록: 전사 공개 1건 + 참석자 한정 1건(둘 다 소유자가 작성), 타인 작성 1건
insert into public.meeting_minutes (id, title, visibility, author_id, author_name) values
  ('d3000000-0000-0000-0000-0000000000a1', '전사 공개 회의',   'OFFICE',       'd3000000-0000-0000-0000-000000000001', '녹음 소유자'),
  ('d3000000-0000-0000-0000-0000000000a2', '참석자 한정 회의', 'PARTICIPANTS', 'd3000000-0000-0000-0000-000000000001', '녹음 소유자'),
  ('d3000000-0000-0000-0000-0000000000a3', '타인 작성 회의',   'PARTICIPANTS', 'd3000000-0000-0000-0000-000000000002', '다른 녹음 소유자');

-- 녹음 4건: 미연결 / 전사 공개 회의록 연결 / 참석자 한정 회의록 연결 / 타인 소유
insert into public.meeting_recordings (id, minute_id, owner_id, status) values
  ('d3000000-0000-0000-0000-0000000000b1', null,                                   'd3000000-0000-0000-0000-000000000001', 'RECORDING'),
  ('d3000000-0000-0000-0000-0000000000b2', 'd3000000-0000-0000-0000-0000000000a1', 'd3000000-0000-0000-0000-000000000001', 'READY'),
  ('d3000000-0000-0000-0000-0000000000b3', 'd3000000-0000-0000-0000-0000000000a2', 'd3000000-0000-0000-0000-000000000001', 'READY'),
  ('d3000000-0000-0000-0000-0000000000b4', null,                                   'd3000000-0000-0000-0000-000000000002', 'RECORDING');

insert into public.meeting_recording_segments
  (id, recording_id, segment_no, storage_path, file_name, mime_type, byte_size, duration_ms, status)
values
  ('d3000000-0000-0000-0000-0000000000c1', 'd3000000-0000-0000-0000-0000000000b1', 1,
   'd3000000-0000-0000-0000-0000000000b1/d3000000-0000-0000-0000-0000000000c1.webm',
   '회의녹음-001.webm', 'audio/webm', 1024, 60000, 'PENDING'),
  ('d3000000-0000-0000-0000-0000000000c4', 'd3000000-0000-0000-0000-0000000000b2', 1,
   'd3000000-0000-0000-0000-0000000000b2/d3000000-0000-0000-0000-0000000000c4.webm',
   '회의녹음-001.webm', 'audio/webm', 2048, 60000, 'READY');

-- ── 1. 소유자는 자기 녹음을 모두 보고, 남의 녹음은 보지 않는다 ─────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d3000000-0000-0000-0000-000000000001","session_version":1}', true);

select is((select count(*)::int from public.meeting_recordings), 3,
  '소유자는 자신이 만든 녹음 3건을 본다');
select is((select count(*)::int from public.meeting_recordings
            where id = 'd3000000-0000-0000-0000-0000000000b4'), 0,
  '소유자에게 타인 소유의 미연결 녹음은 보이지 않는다');
select is((select count(*)::int from public.meeting_recording_segments), 2,
  '소유자는 자기 녹음의 구간을 모두 본다');
reset role;

-- ── 2. 다른 소유자: 자기 녹음 + 전사 공개 회의록에 연결된 녹음까지 ─────
-- (연결된 회의록 열람자에게 보이는 것은 마이그레이션이 명시한 허용 경로다)
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d3000000-0000-0000-0000-000000000002","session_version":1}', true);

select is((select count(*)::int from public.meeting_recordings), 2,
  '다른 소유자는 자기 녹음과 전사 공개 회의록에 연결된 녹음만 본다');
select is((select count(*)::int from public.meeting_recordings
            where id = 'd3000000-0000-0000-0000-0000000000b2'), 1,
  '전사 공개 회의록에 연결된 녹음은 그 회의록 열람자에게 허용된다');
select is((select count(*)::int from public.meeting_recordings
            where id in ('d3000000-0000-0000-0000-0000000000b1',
                         'd3000000-0000-0000-0000-0000000000b3')), 0,
  '미연결 녹음과 참석자 한정 회의록의 녹음은 타인에게 보이지 않는다');
select is((select count(*)::int from public.meeting_recording_segments), 1,
  '구간 가시성은 상위 녹음의 판정을 그대로 따른다');
reset role;

-- ── 3. OFFICE 읽기 권한만 있는 사용자 ──────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d3000000-0000-0000-0000-000000000003","session_version":1}', true);

select is((select count(*)::int from public.meeting_recordings), 1,
  'OFFICE 읽기 권한자는 전사 공개 회의록에 연결된 녹음 1건만 본다');
select is((select count(*)::int from public.meeting_recordings
            where id = 'd3000000-0000-0000-0000-0000000000b2'), 1,
  'OFFICE 읽기 권한자가 보는 그 1건은 전사 공개 회의록의 녹음이다');
reset role;

-- ── 4. 권한 없는 임직원 ────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d3000000-0000-0000-0000-000000000004","session_version":1}', true);

select is((select count(*)::int from public.meeting_recordings), 0,
  'OFFICE 권한이 없는 임직원에게는 녹음이 한 건도 보이지 않는다');
select is((select count(*)::int from public.meeting_recording_segments), 0,
  'OFFICE 권한이 없는 임직원에게는 녹음 구간도 보이지 않는다');
reset role;

-- ── 5. 미인증(anon) ────────────────────────────────────────────────────
set local role anon;
select throws_ok(
  $$ select count(*) from public.meeting_recordings $$,
  '42501', null, '익명 역할은 녹음 원장을 조회할 수 없다');
select throws_ok(
  $$ select count(*) from public.meeting_recording_segments $$,
  '42501', null, '익명 역할은 녹음 구간을 조회할 수 없다');
select throws_ok(
  $$ select public.start_meeting_recording(null) $$,
  '42501', null, '익명 역할은 녹음 시작 RPC를 실행할 수 없다');
reset role;

-- ── 6. 소유자라도 원장을 직접 쓰지 못한다(쓰기는 RPC 한 경로) ──────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d3000000-0000-0000-0000-000000000001","session_version":1}', true);

select throws_ok(
  $$ insert into public.meeting_recordings (owner_id)
     values ('d3000000-0000-0000-0000-000000000001') $$,
  '42501', null, '소유자도 녹음 원장에 직접 INSERT 할 수 없다');
select throws_ok(
  $$ update public.meeting_recordings set status = 'READY'
      where id = 'd3000000-0000-0000-0000-0000000000b1' $$,
  '42501', null, '소유자도 녹음 원장을 직접 UPDATE 할 수 없다');
select throws_ok(
  $$ delete from public.meeting_recordings
      where id = 'd3000000-0000-0000-0000-0000000000b1' $$,
  '42501', null, '소유자도 녹음 원장을 직접 DELETE 할 수 없다');
select throws_ok(
  $$ update public.meeting_recording_segments set status = 'READY'
      where id = 'd3000000-0000-0000-0000-0000000000c1' $$,
  '42501', null, '소유자도 녹음 구간을 직접 UPDATE 할 수 없다');
reset role;

-- ── 7. 상태 전이 RPC는 권한 없는 호출을 거절한다 ───────────────────────
-- 7-1. OFFICE 쓰기 권한이 없는 사용자
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d3000000-0000-0000-0000-000000000004","session_version":1}', true);
select throws_ok(
  $$ select public.start_meeting_recording(null) $$,
  '42501', null, 'OFFICE 권한이 없으면 녹음을 시작할 수 없다');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d3000000-0000-0000-0000-000000000003","session_version":1}', true);
select throws_ok(
  $$ select public.start_meeting_recording(null) $$,
  '42501', null, 'OFFICE 읽기 권한만으로는 녹음을 시작할 수 없다');
reset role;

-- 7-2. OFFICE 쓰기 권한이 있어도 남의 녹음은 바꾸지 못한다
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d3000000-0000-0000-0000-000000000002","session_version":1}', true);

select throws_ok(
  $$ select public.prepare_meeting_recording_segment(
       'd3000000-0000-0000-0000-0000000000cf',
       'd3000000-0000-0000-0000-0000000000b1', 9,
       'd3000000-0000-0000-0000-0000000000b1/d3000000-0000-0000-0000-0000000000cf.webm',
       '침입.webm', 'audio/webm', 1024, 60000) $$,
  '42501', null, '타인의 녹음에는 구간을 저장할 수 없다');
select throws_ok(
  $$ select public.complete_meeting_recording_segment('d3000000-0000-0000-0000-0000000000c1') $$,
  '42501', null, '타인의 녹음 구간은 완료 처리할 수 없다');
select throws_ok(
  $$ select public.finish_meeting_recording('d3000000-0000-0000-0000-0000000000b1', 1000) $$,
  '42501', null, '타인의 녹음은 종료할 수 없다');
select throws_ok(
  $$ select public.complete_meeting_recording(
       'd3000000-0000-0000-0000-0000000000b1', '가로챈 전사', '{}'::jsonb) $$,
  '42501', null, '타인의 녹음에는 전사·AI 초안을 기록할 수 없다');
select throws_ok(
  $$ select public.attach_meeting_recording(
       'd3000000-0000-0000-0000-0000000000b1', 'd3000000-0000-0000-0000-0000000000a3') $$,
  '42501', null, '타인의 녹음을 자기 회의록에 붙일 수 없다');
reset role;

-- 7-3. 자기 녹음이라도 남의 회의록에는 붙이지 못한다
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d3000000-0000-0000-0000-000000000001","session_version":1}', true);
select throws_ok(
  $$ select public.attach_meeting_recording(
       'd3000000-0000-0000-0000-0000000000b1', 'd3000000-0000-0000-0000-0000000000a3') $$,
  '42501', null, '회의록 작성자가 아니면 자기 녹음도 그 회의록에 연결할 수 없다');
select throws_ok(
  $$ select public.start_meeting_recording('d3000000-0000-0000-0000-0000000000a3') $$,
  '42501', null, '남의 회의록을 지정해 녹음을 시작할 수 없다');
select throws_ok(
  $$ select public.attach_meeting_recording(
       'd3000000-0000-0000-0000-0000000000b3', 'd3000000-0000-0000-0000-0000000000a1') $$,
  '23514', null, '이미 다른 회의록에 연결된 녹음은 옮겨 붙일 수 없다');
reset role;

-- ── 8. 허용 경로는 실제로 동작한다(거부만 확인하면 판정이 죽어도 통과한다) ─
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d3000000-0000-0000-0000-000000000001","session_version":1}', true);

select isnt((select public.start_meeting_recording(null)), null::uuid,
  'OFFICE 쓰기 권한자는 녹음 세션을 시작한다');
select is((select count(*)::int from public.meeting_recordings
            where owner_id = 'd3000000-0000-0000-0000-000000000001' and status = 'RECORDING'), 2,
  '시작한 세션이 소유자에게 보인다');

select lives_ok(
  $$ select public.prepare_meeting_recording_segment(
       'd3000000-0000-0000-0000-0000000000c2',
       'd3000000-0000-0000-0000-0000000000b1', 2,
       'd3000000-0000-0000-0000-0000000000b1/d3000000-0000-0000-0000-0000000000c2.webm',
       '회의녹음-002.webm', 'audio/webm', 1024, 60000) $$,
  '소유자는 규칙에 맞는 경로로 구간을 저장한다');
select throws_ok(
  $$ select public.prepare_meeting_recording_segment(
       'd3000000-0000-0000-0000-0000000000c3',
       'd3000000-0000-0000-0000-0000000000b1', 3,
       'd3000000-0000-0000-0000-0000000000b4/d3000000-0000-0000-0000-0000000000c3.webm',
       '경로위조.webm', 'audio/webm', 1024, 60000) $$,
  '22023', null, '다른 녹음의 경로를 지정한 구간 저장은 거절된다');

select throws_ok(
  $$ select public.complete_meeting_recording_segment('d3000000-0000-0000-0000-0000000000c2') $$,
  '22023', null, '실제 업로드가 없으면 구간을 완료 처리하지 않는다');
reset role;

-- 업로드가 실제로 있었던 상황을 만든다(Storage는 Edge/클라이언트가 쓰므로 픽스처로 삽입).
insert into storage.objects (bucket_id, name)
values ('meeting-recordings',
        'd3000000-0000-0000-0000-0000000000b1/d3000000-0000-0000-0000-0000000000c2.webm');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d3000000-0000-0000-0000-000000000001","session_version":1}', true);

select lives_ok(
  $$ select public.complete_meeting_recording_segment('d3000000-0000-0000-0000-0000000000c2') $$,
  '업로드가 확인되면 소유자는 구간을 완료 처리한다');
select is((select status from public.meeting_recording_segments
            where id = 'd3000000-0000-0000-0000-0000000000c2'), 'UPLOADED',
  '완료 처리된 구간의 상태는 UPLOADED가 된다');

select lives_ok(
  $$ select public.finish_meeting_recording('d3000000-0000-0000-0000-0000000000b1', 120000) $$,
  '소유자는 녹음을 종료한다');
select is((select status from public.meeting_recordings
            where id = 'd3000000-0000-0000-0000-0000000000b1'), 'PROCESSING',
  '종료한 녹음은 PROCESSING으로 넘어간다');

select lives_ok(
  $$ select public.complete_meeting_recording(
       'd3000000-0000-0000-0000-0000000000b1', '회의 전사 본문', '{"summary":"요약"}'::jsonb) $$,
  '소유자는 전사·AI 초안을 기록한다');
select is((select status from public.meeting_recordings
            where id = 'd3000000-0000-0000-0000-0000000000b1'), 'READY',
  '전사가 기록된 녹음은 READY가 된다');

select lives_ok(
  $$ select public.attach_meeting_recording(
       'd3000000-0000-0000-0000-0000000000b1', 'd3000000-0000-0000-0000-0000000000a1') $$,
  '작성자 본인의 회의록에는 자기 녹음을 연결할 수 있다');
select is((select minute_id from public.meeting_recordings
            where id = 'd3000000-0000-0000-0000-0000000000b1'),
  'd3000000-0000-0000-0000-0000000000a1'::uuid,
  '연결된 녹음은 그 회의록을 가리킨다');
reset role;

-- 연결 이후에는 그 회의록 열람자에게도 보인다(같은 공유 규칙의 뒷면).
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d3000000-0000-0000-0000-000000000003","session_version":1}', true);
select is((select count(*)::int from public.meeting_recordings
            where id = 'd3000000-0000-0000-0000-0000000000b1'), 1,
  '전사 공개 회의록에 연결된 뒤에는 OFFICE 열람자에게도 보인다');
reset role;

-- ── 9. 삭제(soft delete)된 녹음은 소유자에게도 닫힌다 ──────────────────
update public.meeting_recordings
   set deleted_at = now()
 where id = 'd3000000-0000-0000-0000-0000000000b3';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d3000000-0000-0000-0000-000000000001","session_version":1}', true);
select is((select count(*)::int from public.meeting_recordings
            where id = 'd3000000-0000-0000-0000-0000000000b3'), 0,
  '소프트 삭제된 녹음은 소유자에게도 조회되지 않는다');
reset role;

select * from finish();
rollback;
