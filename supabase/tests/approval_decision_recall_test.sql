begin;
select plan(11);

insert into public.users(id, user_type, name, session_version) values
  ('10000000-0000-0000-0000-000000000001', 'read_only', 'recall_drafter', 1),
  ('10000000-0000-0000-0000-000000000002', 'read_only', 'recall_first', 1),
  ('10000000-0000-0000-0000-000000000003', 'read_only', 'recall_last', 1);

-- 중간 승인 취소 -------------------------------------------------------
insert into public.approval_documents(id, title, form_type, drafter_id, status) values
  ('20000000-0000-0000-0000-000000000001', '중간 승인 취소', 'GENERAL',
   '10000000-0000-0000-0000-000000000001', 'IN_REVIEW');
insert into public.approval_lines(
  id, document_id, approver_id, step_order, kind, round, decision, decided_at
) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002', 1, 'APPROVAL', 1, 'APPROVED', now() - interval '1 minute'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000003', 2, 'APPROVAL', 1, 'APPROVED', now()),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000003', 3, 'APPROVAL', 1, 'PENDING', null);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"10000000-0000-0000-0000-000000000002","session_version":1}',
  true
);
select is(
  public.recall_approval_decision('30000000-0000-0000-0000-000000000001', '오탈자'),
  'WITHDRAWN',
  '후속 승인이 일부 처리됐어도 미결 결재가 남으면 본인 승인은 취소된다'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

select is(
  (select decision::text from public.approval_lines
    where id = '30000000-0000-0000-0000-000000000001'),
  'PENDING',
  '취소한 결재선은 PENDING으로 돌아간다'
);
select is(
  (select status::text from public.approval_documents
    where id = '20000000-0000-0000-0000-000000000001'),
  'IN_REVIEW',
  '다른 승인이 남아 있으면 문서는 IN_REVIEW를 유지한다'
);
select is(
  (select count(*)::integer from public.approval_document_events
    where document_id = '20000000-0000-0000-0000-000000000001'
      and event_type = 'APPROVAL_WITHDRAWN'),
  1,
  '승인 취소 이벤트가 남는다'
);

-- 최종 승인 초기화 -----------------------------------------------------
insert into public.approval_documents(id, title, form_type, drafter_id, status) values
  ('20000000-0000-0000-0000-000000000002', '최종 승인 초기화', 'GENERAL',
   '10000000-0000-0000-0000-000000000001', 'APPROVED');
insert into public.approval_lines(
  id, document_id, approver_id, step_order, kind, round, decision, decided_at
) values
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000002', 1, 'APPROVAL', 1, 'APPROVED', now() - interval '1 minute'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000003', 2, 'APPROVAL', 1, 'APPROVED', now());

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"10000000-0000-0000-0000-000000000003","session_version":1}',
  true
);
select is(
  public.recall_approval_decision('30000000-0000-0000-0000-000000000004', '최종 확인 중 오탈자 발견'),
  'RESET',
  '최종 승인자는 완료 결재를 초기화한다'
);
reset role;

select is(
  (select status::text from public.approval_documents
    where id = '20000000-0000-0000-0000-000000000002'),
  'REJECTED',
  '초기화한 문서는 기안자에게 반려된다'
);
select is(
  (select count(*)::integer from public.approval_lines
    where document_id = '20000000-0000-0000-0000-000000000002'
      and round = 1 and decision = 'APPROVED'),
  2,
  '완료 회차 승인 이력은 보존된다'
);
select is(
  (select count(*)::integer from public.approval_lines
    where document_id = '20000000-0000-0000-0000-000000000002'
      and round = 2 and decision = 'PENDING'),
  2,
  '전체 결재선이 새 PENDING 회차로 복제된다'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"10000000-0000-0000-0000-000000000001","session_version":1}',
  true
);
select lives_ok(
  $$ select public.resubmit_approval_document(
       '20000000-0000-0000-0000-000000000002', '오탈자 수정', '{}'::jsonb
     ) $$,
  '기안자는 최종 승인 초기화 문서를 재상신할 수 있다'
);
reset role;

select is(
  (select status::text from public.approval_documents
    where id = '20000000-0000-0000-0000-000000000002'),
  'PENDING',
  '재상신하면 초기화 회차가 처음부터 시작된다'
);
select is(
  (select max(round)::integer from public.approval_lines
    where document_id = '20000000-0000-0000-0000-000000000002'),
  2,
  '재상신은 불필요한 세 번째 회차를 만들지 않는다'
);

select * from finish();
rollback;
