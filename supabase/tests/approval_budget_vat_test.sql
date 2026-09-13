-- 워크스페이스 예산·지출 실행 규칙(20260913190000)의 서버 계층 회귀.
-- 부가세 총액 기준 · 상신 검증(우회 경로 포함) · 배정 · 취소 · 재시도 안전.
begin;
select plan(52);

-- ── 픽스처 ────────────────────────────────────────────────────────────
insert into public.users(id, user_type, name, session_version) values
  ('a0000000-0000-0000-0000-000000000001', 'read_only', 'vat_drafter', 1);

insert into public.approval_forms(id, name, abbrev, budget_link) values
  ('f0000000-0000-0000-0000-000000000001', '부가세 품의서',     '부품', 'NONE'),
  ('f0000000-0000-0000-0000-000000000002', '부가세 지출결의서', '부지', 'SPEND_REQUIRED'),
  ('f0000000-0000-0000-0000-000000000003', '옛 품의서',         '옛품', 'NONE'),
  ('f0000000-0000-0000-0000-000000000004', '부가세 예산 변경',  '부변', 'REVISE'),
  ('f0000000-0000-0000-0000-000000000005', '일반 문서',         '부일', 'NONE');

insert into public.approval_form_versions(id, form_id, version_no, fields) values
  ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 1,
   '[{"key":"budget","label":"예산","type":"BUDGET_TREE","levels":["대분류"],"columns":[
       {"key":"kind","label":"과세 유형","type":"VAT_KIND"},
       {"key":"net","label":"공급가액","type":"MONEY","role":"NET"},
       {"key":"vat","label":"부가세","type":"MONEY","role":"VAT"},
       {"key":"gross","label":"합계액","type":"MONEY","role":"GROSS","primaryAmount":true}]}]'::jsonb),
  ('e0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', 1,
   '[{"key":"expense_items","label":"지출 내역","type":"TABLE","columns":[
       {"key":"budgetLine","label":"예산 줄","type":"BUDGET_REF"},
       {"key":"kind","label":"과세 유형","type":"VAT_KIND"},
       {"key":"net","label":"공급가액","type":"MONEY","role":"NET"},
       {"key":"vat","label":"부가세","type":"MONEY","role":"VAT"},
       {"key":"gross","label":"합계액","type":"MONEY","role":"GROSS","primaryAmount":true}]}]'::jsonb),
  ('e0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003', 1,
   '[{"key":"budget","label":"예산","type":"BUDGET_TREE","levels":["대분류"],"columns":[
       {"key":"amount","label":"금액","type":"MONEY","primaryAmount":true}]}]'::jsonb),
  ('e0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000004', 1,
   '[{"key":"budget","label":"예산","type":"BUDGET_TREE","levels":["대분류"],"columns":[
       {"key":"kind","label":"과세 유형","type":"VAT_KIND"},
       {"key":"net","label":"공급가액","type":"MONEY","role":"NET"},
       {"key":"vat","label":"부가세","type":"MONEY","role":"VAT"},
       {"key":"gross","label":"합계액","type":"MONEY","role":"GROSS","primaryAmount":true}]}]'::jsonb),
  ('e0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000005', 1, '[]'::jsonb);

-- 승인된 근거 품의: 한 줄 b1에 합계액 1,100,000원(공급가액 1,000,000 + 부가세 100,000).
insert into public.approval_documents(
  id, title, form_type, drafter_id, status, form_id, form_version_id, field_values
) values (
  'd0000000-0000-0000-0000-000000000001', '승인된 품의', 'GENERAL',
  'a0000000-0000-0000-0000-000000000001', 'APPROVED',
  'f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001',
  '{"budget":{"levels":["대분류"],"rows":[
     {"id":"b1","depth":0,"name":"운영비","values":
       {"kind":"TAXABLE","net":"1000000","vat":"100000","gross":"1100000"}}]}}'::jsonb
);

-- ── (1) 항목 금액과 총액 기준 ─────────────────────────────────────────
select results_eq(
  $$ select line_id, net, vat, gross, vat_kind, split_required
       from app.approval_budget_item_amounts(
         (select fields from public.approval_form_versions
           where id = 'e0000000-0000-0000-0000-000000000001'),
         (select field_values from public.approval_documents
           where id = 'd0000000-0000-0000-0000-000000000001')) $$,
  $$ values ('b1'::text, 1000000::numeric, 100000::numeric, 1100000::numeric,
             'TAXABLE'::text, true) $$,
  '예산 항목이 공급가액·부가세·합계액으로 갈라져 읽힌다'
);

select is(
  (select amount from app.approval_budget_lines(
     (select fields from public.approval_form_versions
       where id = 'e0000000-0000-0000-0000-000000000001'),
     (select field_values from public.approval_documents
       where id = 'd0000000-0000-0000-0000-000000000001'))),
  1100000::numeric,
  '차감의 기준은 부가세 포함 합계액이다'
);

select results_eq(
  $$ select gross, split_required from app.approval_budget_item_amounts(
       (select fields from public.approval_form_versions
         where id = 'e0000000-0000-0000-0000-000000000003'),
       '{"budget":{"levels":["대분류"],"rows":[
          {"id":"b1","depth":0,"name":"옛 항목","values":{"amount":"500000"}}]}}'::jsonb) $$,
  $$ values (500000::numeric, false) $$,
  '역할 열이 없는 옛 양식은 합계액만 읽히고 부가세 칸을 요구하지 않는다'
);

-- ── (2) 금액 정합성 ───────────────────────────────────────────────────
select throws_ok(
  $$ select app.assert_approval_amounts(
       (select fields from public.approval_form_versions
         where id = 'e0000000-0000-0000-0000-000000000001'),
       '{"budget":{"levels":["대분류"],"rows":[
          {"id":"b1","depth":0,"name":"x","values":
            {"kind":"TAXABLE","net":"1000000","vat":"100000","gross":"1200000"}}]}}'::jsonb) $$,
  '23514', null,
  '합계액이 공급가액+부가세와 다르면 거절한다'
);

select throws_ok(
  $$ select app.assert_approval_amounts(
       (select fields from public.approval_form_versions
         where id = 'e0000000-0000-0000-0000-000000000001'),
       '{"budget":{"levels":["대분류"],"rows":[
          {"id":"b1","depth":0,"name":"x","values":{"gross":"1100000"}}]}}'::jsonb) $$,
  '23514', null,
  '새 양식에서 공급가액·부가세·과세 유형을 모두 비우면 옛 양식으로 오인되지 않는다'
);

select throws_ok(
  $$ select app.assert_approval_amounts(
       (select fields from public.approval_form_versions
         where id = 'e0000000-0000-0000-0000-000000000001'),
       '{"budget":{"levels":["대분류"],"rows":[
          {"id":"b1","depth":0,"name":"x","values":
            {"kind":"EXEMPT","net":"1000000","vat":"100000","gross":"1100000"}}]}}'::jsonb) $$,
  '23514', null,
  '면세 항목에 세액이 붙어 있으면 거절한다'
);

select throws_ok(
  $$ select app.assert_approval_amounts(
       (select fields from public.approval_form_versions
         where id = 'e0000000-0000-0000-0000-000000000002'),
       '{"expense_items":[{"budgetLine":"","kind":"TAXABLE",
          "net":"1000","vat":"100","gross":"1100"}]}'::jsonb) $$,
  '23502', null,
  '금액이 적힌 지출 행에 예산 줄이 없으면 버리지 않고 거절한다'
);

select lives_ok(
  $$ select app.assert_approval_amounts(
       (select fields from public.approval_form_versions
         where id = 'e0000000-0000-0000-0000-000000000003'),
       '{"budget":{"levels":["대분류"],"rows":[
          {"id":"b1","depth":0,"name":"옛 항목","values":{"amount":"500000"}}]}}'::jsonb) $$,
  '옛 문서는 과세 유형을 추정당하지 않고 그대로 통과한다'
);

-- ── (3) 상신 검증은 RPC가 아니라 원장에 걸린다 ────────────────────────
insert into public.approval_documents(
  id, title, form_type, drafter_id, status, form_id, form_version_id,
  budget_document_id, field_values
) values (
  'd0000000-0000-0000-0000-000000000002', '초과 지출', 'GENERAL',
  'a0000000-0000-0000-0000-000000000001', 'DRAFT',
  'f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002',
  'd0000000-0000-0000-0000-000000000001',
  '{"expense_items":[{"budgetLine":"b1","kind":"TAXABLE",
     "net":"2000000","vat":"200000","gross":"2200000"}]}'::jsonb
);

select throws_ok(
  $$ update public.approval_documents set status = 'PENDING'
      where id = 'd0000000-0000-0000-0000-000000000002' $$,
  '23514', null,
  'RPC를 거치지 않고 상태만 바꾸는 경로에서도 항목 초과가 막힌다'
);

select throws_ok(
  $$ insert into public.approval_documents(
       title, form_type, drafter_id, status, form_id, form_version_id,
       budget_document_id, field_values
     ) values (
       '신규 상신', 'GENERAL', 'a0000000-0000-0000-0000-000000000001', 'PENDING',
       'f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002',
       'd0000000-0000-0000-0000-000000000001',
       '{"expense_items":[{"budgetLine":"b1","kind":"TAXABLE",
          "net":"2000000","vat":"200000","gross":"2200000"}]}'::jsonb) $$,
  '23514', null,
  '문서를 곧바로 상신 상태로 만들어도 같은 검증을 받는다'
);

select throws_ok(
  $$ insert into public.approval_documents(
       title, form_type, drafter_id, status, form_id, form_version_id,
       budget_document_id, field_values
     ) values (
       '없는 줄', 'GENERAL', 'a0000000-0000-0000-0000-000000000001', 'PENDING',
       'f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002',
       'd0000000-0000-0000-0000-000000000001',
       '{"expense_items":[{"budgetLine":"b9","kind":"TAXABLE",
          "net":"1000","vat":"100","gross":"1100"}]}'::jsonb) $$,
  '23503', null,
  '근거 품의에 없는 예산 항목은 거절한다'
);

-- 사용 가능액 안이면 통과하고, 그 순간부터 예약으로 잡힌다.
update public.approval_documents
   set field_values = '{"expense_items":[{"budgetLine":"b1","kind":"TAXABLE",
         "net":"500000","vat":"50000","gross":"550000"}]}'::jsonb
 where id = 'd0000000-0000-0000-0000-000000000002';

select lives_ok(
  $$ update public.approval_documents set status = 'PENDING'
      where id = 'd0000000-0000-0000-0000-000000000002' $$,
  '사용 가능액 안의 지출은 상신된다'
);

select results_eq(
  $$ select line_id, spent, pending from app.approval_budget_usage(
       'd0000000-0000-0000-0000-000000000001') $$,
  $$ values ('b1'::text, 0::numeric, 550000::numeric) $$,
  '상신한 지출은 합계액만큼 예약으로 잡힌다'
);

select is(
  (select count(*)::int from app.approval_budget_usage_ex(
     'd0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002')),
  0,
  '자기 자신을 뺀 집계는 자기 예약을 두 번 세지 않는다'
);

-- 승인되지 않은 품의를 근거로 삼으면 막힌다.
insert into public.approval_documents(
  id, title, form_type, drafter_id, status, form_id, form_version_id, field_values
) values (
  -- 배정 품의는 워크스페이스에 걸린 뒤에야 상신되므로(§5) 여기서는 DRAFT로 세운다.
  'd0000000-0000-0000-0000-000000000003', '흐르는 품의', 'GENERAL',
  'a0000000-0000-0000-0000-000000000001', 'DRAFT',
  'f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001',
  '{"budget":{"levels":["대분류"],"rows":[{"id":"c1","depth":0,"name":"x","values":
     {"kind":"TAXABLE","net":"1000","vat":"100","gross":"1100"}}]}}'::jsonb
);

select throws_ok(
  $$ insert into public.approval_documents(
       title, form_type, drafter_id, status, form_id, form_version_id,
       budget_document_id, field_values
     ) values (
       '미승인 근거', 'GENERAL', 'a0000000-0000-0000-0000-000000000001', 'PENDING',
       'f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002',
       'd0000000-0000-0000-0000-000000000003',
       '{"expense_items":[{"budgetLine":"c1","kind":"TAXABLE",
          "net":"100","vat":"10","gross":"110"}]}'::jsonb) $$,
  '42501', null,
  '최종 승인되지 않은 품의는 근거가 되지 못한다'
);

-- ── (4) 예산 변경 — 음수 잔액 허용, 재시도 안전, 취소 기준 ────────────
insert into public.approval_documents(
  id, title, form_type, drafter_id, status, form_id, form_version_id,
  budget_document_id, field_values
) values (
  'd0000000-0000-0000-0000-000000000004', '예산 감액', 'GENERAL',
  'a0000000-0000-0000-0000-000000000001', 'APPROVED',
  'f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000004',
  'd0000000-0000-0000-0000-000000000001',
  '{"budget":{"levels":["대분류"],"rows":[{"id":"b1","depth":0,"name":"운영비","values":
     {"kind":"TAXABLE","net":"100000","vat":"10000","gross":"110000"}}]}}'::jsonb
);

select lives_ok(
  $$ select app.apply_approval_budget_revision('d0000000-0000-0000-0000-000000000004') $$,
  '예약보다 작은 금액으로 줄이는 변경도 적용된다(잔액 음수 허용)'
);

select lives_ok(
  $$ select app.apply_approval_budget_revision('d0000000-0000-0000-0000-000000000004') $$,
  '같은 변경을 다시 적용해도 죽지 않는다'
);

select is(
  (select count(*)::int from public.approval_budget_revisions
    where target_document_id = 'd0000000-0000-0000-0000-000000000001'),
  1,
  '재시도해도 변경 이력은 한 줄이다'
);

select lives_ok(
  $$ update public.approval_documents set status = 'APPROVED'
      where id = 'd0000000-0000-0000-0000-000000000002' $$,
  '감액으로 잔액이 음수가 된 뒤에도 진행 중이던 지출은 최종 승인될 수 있다'
);

select throws_ok(
  $$ select app.assert_no_active_budget_children('d0000000-0000-0000-0000-000000000001') $$,
  '23504', null,
  '승인된 지출이 살아 있으면 품의 승인을 취소하지 못한다'
);

-- 승인 취소는 신규 상신이 아니다. 사용액을 예약으로 되돌릴 뿐이므로 초과 검사를 받지 않는다 —
-- 받으면 감액 뒤에는 승인 취소가 영구히 막힌다.
select lives_ok(
  $$ update public.approval_documents set status = 'PENDING'
      where id = 'd0000000-0000-0000-0000-000000000002' $$,
  '감액 뒤에도 승인 취소(APPROVED→진행 중)는 초과 검사에 막히지 않는다'
);

-- 지출이 정리되면, 끝난 예산 변경 이력만 남아도 취소할 수 있어야 한다.
update public.approval_documents set status = 'DRAFT'
 where id = 'd0000000-0000-0000-0000-000000000002';

select lives_ok(
  $$ select app.assert_no_active_budget_children('d0000000-0000-0000-0000-000000000001') $$,
  '적용이 끝난 예산 변경 이력은 품의 취소를 영구히 막지 않는다'
);

-- ── (5) 워크스페이스 배정 ─────────────────────────────────────────────
-- 트리거는 '둘 이상 걸지 못한다'까지만 말한다. 0건 상신을 화면만 막으면 직접 INSERT·UPDATE로
-- 어느 사업에도 잡히지 않은 배정 품의가 서고, 그 예산이 지출만 받는다.
select throws_ok(
  $$ update public.approval_documents set status = 'PENDING'
      where id = 'd0000000-0000-0000-0000-000000000003' $$,
  '23502', null,
  '워크스페이스에 걸리지 않은 배정 품의는 상신되지 않는다'
);

select throws_ok(
  $$ insert into public.approval_documents(
       title, form_type, drafter_id, status, form_id, form_version_id, field_values
     ) values (
       '배정 없는 신규 상신', 'GENERAL', 'a0000000-0000-0000-0000-000000000001', 'PENDING',
       'f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001',
       '{"budget":{"levels":["대분류"],"rows":[{"id":"z1","depth":0,"name":"x","values":
          {"kind":"TAXABLE","net":"1000","vat":"100","gross":"1100"}}]}}'::jsonb) $$,
  '23502', null,
  '곧바로 상신 상태로 만드는 경로도 배정 없이는 통과하지 못한다'
);

insert into public.approval_program_links(id, document_id, target_type, target_id) values
  ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003',
   'program', 'b0000000-0000-0000-0000-0000000000aa');

select lives_ok(
  $$ update public.approval_documents set status = 'PENDING'
      where id = 'd0000000-0000-0000-0000-000000000003' $$,
  '한 곳에 걸린 배정 품의는 상신된다'
);

select throws_ok(
  $$ insert into public.approval_program_links(document_id, target_type, target_id)
     values ('d0000000-0000-0000-0000-000000000003', 'ma_program',
             'b0000000-0000-0000-0000-0000000000bb') $$,
  '23505', null,
  '예산을 배정하는 품의는 워크스페이스 한 곳에만 걸린다'
);

select throws_ok(
  $$ insert into public.approval_program_links(document_id, target_type, target_id)
     values ('d0000000-0000-0000-0000-000000000001', 'fund',
             'b0000000-0000-0000-0000-0000000000cc') $$,
  '42501', null,
  '최종 승인된 문서에는 배정을 새로 걸 수 없다'
);

insert into public.approval_documents(
  id, title, form_type, drafter_id, status, form_id, form_version_id
) values (
  'd0000000-0000-0000-0000-000000000005', '일반 문서', 'GENERAL',
  'a0000000-0000-0000-0000-000000000001', 'DRAFT',
  'f0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000005'
);

select lives_ok(
  $$ insert into public.approval_program_links(document_id, target_type, target_id)
     values ('d0000000-0000-0000-0000-000000000005', 'fund',
             'b0000000-0000-0000-0000-0000000000cc') $$,
  '조합(FUND)이 배정 대상으로 열린다'
);

-- ── (6) 기밀 M&A 게시글 배정 권한 ─────────────────────────────────────
-- can_link_entity_target은 워크스페이스 열람권이 아니라 본문 열람권(can_read_ma_party)을 묻는다.
insert into public.users(id, user_type, name, session_version) values
  ('a0000000-0000-0000-0000-000000000002', 'super_admin', 'vat_admin', 1);

insert into public.ma_buyers(id, name, created_by) values
  ('b0000000-0000-0000-0000-0000000000dd', '기밀 인수 희망',
   'a0000000-0000-0000-0000-000000000002');

select set_config('request.jwt.claims',
  '{"app_user_id":"a0000000-0000-0000-0000-000000000002","session_version":1}', true);
select is(
  app.can_link_entity_target('ma_buyer', 'b0000000-0000-0000-0000-0000000000dd'),
  true,
  '본문을 열람할 수 있는 사람은 M&A 게시글에 배정할 수 있다'
);

select set_config('request.jwt.claims',
  '{"app_user_id":"a0000000-0000-0000-0000-000000000001","session_version":1}', true);
select is(
  app.can_link_entity_target('ma_buyer', 'b0000000-0000-0000-0000-0000000000dd'),
  false,
  '작성자도 열람자도 아니면 M&A 게시글에 배정하지 못한다'
);
select set_config('request.jwt.claims', '', true);

-- ── (7) 근거는 원 배정 품의만 ─────────────────────────────────────────
-- 변경 품의도 예산표를 갖지만 그 금액은 원 품의에 이미 반영되어 있다. 근거로 허용하면
-- 같은 돈을 두 번 쓴다.
select throws_ok(
  $$ insert into public.approval_documents(
       title, form_type, drafter_id, status, form_id, form_version_id,
       budget_document_id, field_values
     ) values (
       '변경 품의를 근거로', 'GENERAL', 'a0000000-0000-0000-0000-000000000001', 'PENDING',
       'f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002',
       'd0000000-0000-0000-0000-000000000004',
       '{"expense_items":[{"budgetLine":"b1","kind":"TAXABLE",
          "net":"1000","vat":"100","gross":"1100"}]}'::jsonb) $$,
  '42501', '예산 변경 품의는 근거 품의가 될 수 없습니다.',
  '승인된 예산 변경 품의는 지출의 근거가 되지 못한다'
);

-- ── (8) 줄별 지출 내역 RPC ────────────────────────────────────────────
-- 허용 한 쌍과 거절 한 쌍: 로그인한 사람만 실행할 수 있고, 미인증은 목록이 아니라 오류다
-- (빈 목록으로 답하면 '지출이 없다'로 읽힌다).
select ok(
  has_function_privilege('authenticated', 'public.approval_budget_spend_items(uuid)', 'execute'),
  'authenticated는 줄별 지출 내역을 실행할 수 있다'
);
select ok(
  not has_function_privilege('anon', 'public.approval_budget_spend_items(uuid)', 'execute'),
  'anon은 줄별 지출 내역을 실행하지 못한다'
);
select throws_ok(
  $$select * from public.approval_budget_spend_items(
      'd0000000-0000-0000-0000-0000000000b1'::uuid)$$,
  '42501',
  'unauthenticated',
  '미인증 호출은 빈 목록이 아니라 거절이다'
);

-- ── (9) 열 key가 다른 양식으로 올린 예산 변경 ─────────────────────────
-- 변경 품의와 대상 품의가 같은 양식이라는 보장이 없다. 값을 그대로 베끼면 금액이
-- 대상 양식의 어느 칸에도 없어 예산이 0이 된다.
select is(
  app.approval_budget_remap(
    (select fields->0 from public.approval_form_versions
      where id = 'e0000000-0000-0000-0000-000000000003'),
    (select fields->0 from public.approval_form_versions
      where id = 'e0000000-0000-0000-0000-000000000001'),
    '{"levels":["대분류"],"rows":[{"id":"b1","depth":0,"name":"운영비",
       "values":{"amount":"1100000"}}]}'::jsonb) -> 'rows' -> 0 -> 'values',
  '{"gross":"1100000"}'::jsonb,
  '금액 열 하나뿐인 옛 예산표는 합계액 칸에 앉고 공급가액·부가세를 지어내지 않는다'
);

select is(
  app.approval_budget_remap(
    (select fields->0 from public.approval_form_versions
      where id = 'e0000000-0000-0000-0000-000000000001'),
    (select fields->0 from public.approval_form_versions
      where id = 'e0000000-0000-0000-0000-000000000003'),
    '{"levels":["대분류"],"rows":[{"id":"b1","depth":0,"name":"운영비","values":
       {"kind":"TAXABLE","net":"1000000","vat":"100000","gross":"1100000"}}]}'::jsonb)
    -> 'rows' -> 0,
  '{"id":"b1","depth":0,"name":"운영비","values":{"amount":"1100000"}}'::jsonb,
  '대상에 없는 칸은 버리고 줄 id는 그대로 둔다'
);

insert into public.approval_forms(id, name, abbrev, budget_link) values
  ('f0000000-0000-0000-0000-000000000006', '옛 양식 예산 변경', '옛변', 'REVISE');
insert into public.approval_form_versions(id, form_id, version_no, fields) values
  ('e0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000006', 1,
   '[{"key":"budget","label":"예산","type":"BUDGET_TREE","levels":["대분류"],"columns":[
       {"key":"amount","label":"금액","type":"MONEY","primaryAmount":true}]}]'::jsonb);

-- 옛 양식(금액 한 칸)으로 배정된 품의를 부가세 양식 변경안으로 고친다.
insert into public.approval_documents(
  id, title, form_type, drafter_id, status, form_id, form_version_id, field_values
) values (
  'd0000000-0000-0000-0000-000000000006', '옛 양식 대상 품의', 'GENERAL',
  'a0000000-0000-0000-0000-000000000001', 'APPROVED',
  'f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003',
  '{"budget":{"levels":["대분류"],"rows":[{"id":"b1","depth":0,"name":"운영비",
     "values":{"amount":"1100000"}}]}}'::jsonb
);
insert into public.approval_documents(
  id, title, form_type, drafter_id, status, form_id, form_version_id,
  budget_document_id, field_values
) values (
  'd0000000-0000-0000-0000-000000000007', '부가세 양식 변경안', 'GENERAL',
  'a0000000-0000-0000-0000-000000000001', 'APPROVED',
  'f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000004',
  'd0000000-0000-0000-0000-000000000006',
  '{"budget":{"levels":["대분류"],"rows":[{"id":"b1","depth":0,"name":"운영비","values":
     {"kind":"TAXABLE","net":"500000","vat":"50000","gross":"550000"}}]}}'::jsonb
);

select app.apply_approval_budget_revision('d0000000-0000-0000-0000-000000000007');

select is(
  (select amount from app.approval_budget_lines(
     (select fields from public.approval_form_versions
       where id = 'e0000000-0000-0000-0000-000000000003'),
     (select field_values from public.approval_documents
       where id = 'd0000000-0000-0000-0000-000000000006'))),
  550000::numeric,
  '열 key가 다른 양식으로 올린 변경도 대상 품의에서 금액으로 읽힌다'
);

-- 반대 방향은 막는다 — 지울 수 없는 것을 지우는 변경이다.
select throws_ok(
  $$ insert into public.approval_documents(
       title, form_type, drafter_id, status, form_id, form_version_id,
       budget_document_id, field_values
     ) values (
       '합계액만 있는 변경안', 'GENERAL', 'a0000000-0000-0000-0000-000000000001', 'PENDING',
       'f0000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000006',
       'd0000000-0000-0000-0000-000000000001',
       '{"budget":{"levels":["대분류"],"rows":[{"id":"b1","depth":0,"name":"운영비",
          "values":{"amount":"500000"}}]}}'::jsonb) $$,
  '23514', null,
  '대상의 공급가액·부가세를 표현하지 못하는 변경 양식은 상신 단계에서 거절된다'
);

-- ── (10) 배정 규칙은 **배정 품의에만** 건다 ───────────────────────────
-- 일반 결재는 여러 사업에 걸치는 것이 정상이고, 변경 품의는 대상 품의가 이미 워크스페이스를
-- 쥐고 있다. 두 규칙을 모두에게 걸면 정상 결재가 막힌다.
select lives_ok(
  $$ insert into public.approval_program_links(document_id, target_type, target_id)
     values ('d0000000-0000-0000-0000-000000000005', 'program',
             'b0000000-0000-0000-0000-0000000000ee') $$,
  '예산표가 없는 일반 문서는 워크스페이스 여러 곳에 연결할 수 있다'
);

select lives_ok(
  $$ insert into public.approval_program_links(document_id, target_type, target_id)
     values ('d0000000-0000-0000-0000-000000000004', 'program',
             'b0000000-0000-0000-0000-0000000000ff') $$,
  '최종 승인된 변경 품의에도 배정을 걸 수 있다(불변 규칙은 배정 품의의 것이다)'
);

select lives_ok(
  $$ insert into public.approval_program_links(document_id, target_type, target_id)
     values ('d0000000-0000-0000-0000-000000000004', 'fund',
             'b0000000-0000-0000-0000-00000000ff01') $$,
  '변경 품의는 배정이 아니므로 한 곳 제한을 받지 않는다'
);

-- ── (11) 지출 표가 둘인 양식 ──────────────────────────────────────────
-- 양식 검증은 예산 줄 열을 가진 표가 둘인 것을 막지 않는다. 첫 표만 읽으면 둘째 표의 금액이
-- 예약·차감에서 통째로 빠져, 검증을 통과한 문서가 예산을 깎지 않고 지나간다.
insert into public.approval_forms(id, name, abbrev, budget_link) values
  ('f0000000-0000-0000-0000-000000000007', '두 표 지출결의서', '두지', 'SPEND_REQUIRED');
insert into public.approval_form_versions(id, form_id, version_no, fields) values
  ('e0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0000-000000000007', 1,
   '[{"key":"items_a","label":"지출 내역 A","type":"TABLE","columns":[
       {"key":"budgetLine","label":"예산 줄","type":"BUDGET_REF"},
       {"key":"kind","label":"과세 유형","type":"VAT_KIND"},
       {"key":"net","label":"공급가액","type":"MONEY","role":"NET"},
       {"key":"vat","label":"부가세","type":"MONEY","role":"VAT"},
       {"key":"gross","label":"합계액","type":"MONEY","role":"GROSS","primaryAmount":true}]},
     {"key":"items_b","label":"지출 내역 B","type":"TABLE","columns":[
       {"key":"budgetLine","label":"예산 줄","type":"BUDGET_REF"},
       {"key":"kind","label":"과세 유형","type":"VAT_KIND"},
       {"key":"net","label":"공급가액","type":"MONEY","role":"NET"},
       {"key":"vat","label":"부가세","type":"MONEY","role":"VAT"},
       {"key":"gross","label":"합계액","type":"MONEY","role":"GROSS"}]}]'::jsonb);

select results_eq(
  $$ select line_id, gross from app.approval_spend_item_amounts(
       (select fields from public.approval_form_versions
         where id = 'e0000000-0000-0000-0000-000000000007'),
       '{"items_a":[{"budgetLine":"b1","kind":"TAXABLE",
            "net":"100000","vat":"10000","gross":"110000"}],
         "items_b":[{"budgetLine":"b1","kind":"TAXABLE",
            "net":"200000","vat":"20000","gross":"220000"}]}'::jsonb)
      order by gross $$,
  $$ values ('b1'::text, 110000::numeric), ('b1'::text, 220000::numeric) $$,
  '예산 줄 열을 가진 표가 둘이면 둘 다 읽힌다'
);

-- d1의 b1은 앞의 감액으로 110,000원이 되어 있다(살아 있는 지출은 없다).
select throws_ok(
  $$ insert into public.approval_documents(
       title, form_type, drafter_id, status, form_id, form_version_id,
       budget_document_id, field_values
     ) values (
       '두 표 초과 지출', 'GENERAL', 'a0000000-0000-0000-0000-000000000001', 'PENDING',
       'f0000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000007',
       'd0000000-0000-0000-0000-000000000001',
       '{"items_a":[{"budgetLine":"b1","kind":"TAXABLE",
            "net":"50000","vat":"5000","gross":"55000"}],
         "items_b":[{"budgetLine":"b1","kind":"TAXABLE",
            "net":"90000","vat":"9000","gross":"99000"}]}'::jsonb) $$,
  '23514', null,
  '두 표의 금액을 합쳐 초과를 판정한다(첫 표만 보면 통과하던 자리)'
);

select lives_ok(
  $$ insert into public.approval_documents(
       id, title, form_type, drafter_id, status, form_id, form_version_id,
       budget_document_id, field_values
     ) values (
       'd0000000-0000-0000-0000-000000000008', '두 표 지출', 'GENERAL',
       'a0000000-0000-0000-0000-000000000001', 'PENDING',
       'f0000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000007',
       'd0000000-0000-0000-0000-000000000001',
       '{"items_a":[{"budgetLine":"b1","kind":"TAXABLE",
            "net":"50000","vat":"5000","gross":"55000"}],
         "items_b":[{"budgetLine":"b1","kind":"TAXABLE",
            "net":"40000","vat":"4000","gross":"44000"}]}'::jsonb) $$,
  '사용 가능액 안이면 두 표 지출도 상신된다'
);

select results_eq(
  $$ select line_id, spent, pending from app.approval_budget_usage(
       'd0000000-0000-0000-0000-000000000001') $$,
  $$ values ('b1'::text, 0::numeric, 99000::numeric) $$,
  '두 표의 금액이 모두 예약으로 잡힌다'
);

-- ── (12) 옮겨 적은 **결과**를 다시 본다 ───────────────────────────────
-- 상신 검증이 양식 호환을 보지만, 상신을 거치지 않고 승인 상태로 들어온 문서도 있다.
-- 적용 직전에 결과를 놓고 보지 않으면 공급가액·부가세가 빈 예산표가 대상 품의에 앉는다.
insert into public.approval_documents(
  id, title, form_type, drafter_id, status, form_id, form_version_id,
  budget_document_id, field_values
) values (
  'd0000000-0000-0000-0000-000000000009', '합계액만 있는 변경안(직접 승인)', 'GENERAL',
  'a0000000-0000-0000-0000-000000000001', 'APPROVED',
  'f0000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000006',
  'd0000000-0000-0000-0000-000000000001',
  '{"budget":{"levels":["대분류"],"rows":[{"id":"b1","depth":0,"name":"운영비",
     "values":{"amount":"500000"}}]}}'::jsonb
);

select throws_ok(
  $$ select app.apply_approval_budget_revision('d0000000-0000-0000-0000-000000000009') $$,
  '23514', null,
  '옮겨 적은 결과가 대상 양식의 공급가액·부가세를 비우면 적용하지 않는다'
);

select is(
  (select count(*)::int from public.approval_budget_revisions
    where change_document_id = 'd0000000-0000-0000-0000-000000000009'),
  0,
  '거절된 적용은 이력도 남기지 않는다'
);

-- ── (13) 빈 칸과 오타는 다르다 ────────────────────────────────────────
-- 둘 다 app.text_to_numeric이 null로 돌려주므로, 구분하지 않으면 '1oo'를 적은 행이
-- '아직 쓰지 않은 행'으로 통과해 어느 예산도 깎지 않은 채 결재가 흐른다.
select throws_ok(
  $$ select app.assert_approval_amounts(
       (select fields from public.approval_form_versions
         where id = 'e0000000-0000-0000-0000-000000000001'),
       '{"budget":{"levels":["대분류"],"rows":[{"id":"b1","depth":0,"name":"운영비","values":
          {"kind":"TAXABLE","net":"","vat":"","gross":"1oo"}}]}}'::jsonb) $$,
  '23514', null,
  '예산표의 숫자 아닌 금액은 빈 행으로 통과하지 않는다'
);

select throws_ok(
  $$ insert into public.approval_documents(
       title, form_type, drafter_id, status, form_id, form_version_id,
       budget_document_id, field_values
     ) values (
       '오타 지출', 'GENERAL', 'a0000000-0000-0000-0000-000000000001', 'PENDING',
       'f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002',
       'd0000000-0000-0000-0000-000000000001',
       '{"expense_items":[{"budgetLine":"b1","kind":"TAXABLE",
          "net":"abc","vat":"","gross":""}]}'::jsonb) $$,
  '23514', null,
  '지출 항목의 숫자 아닌 금액도 상신에서 막힌다'
);

select throws_ok(
  $$ select app.assert_approval_amounts(
       (select fields from public.approval_form_versions
         where id = 'e0000000-0000-0000-0000-000000000003'),
       '{"budget":{"levels":["대분류"],"rows":[{"id":"b1","depth":0,"name":"운영비","values":
          {"amount":"Infinity"}}]}}'::jsonb) $$,
  '23514', null,
  'NaN·Infinity는 numeric으로 캐스팅되므로 따로 막는다'
);

select lives_ok(
  $$ select app.assert_approval_amounts(
       (select fields from public.approval_form_versions
         where id = 'e0000000-0000-0000-0000-000000000003'),
       '{"budget":{"levels":["대분류"],"rows":[{"id":"b1","depth":0,"name":"운영비","values":
          {"amount":"1,100,000"}}]}}'::jsonb) $$,
  '쉼표를 적은 옛 문서의 금액은 그대로 통과한다'
);

select lives_ok(
  $$ select app.assert_approval_amounts(
       (select fields from public.approval_form_versions
         where id = 'e0000000-0000-0000-0000-000000000001'),
       '{"budget":{"levels":["대분류"],"rows":[{"id":"b1","depth":0,"name":"운영비","values":
          {"kind":"","net":"","vat":"","gross":"  "}}]}}'::jsonb) $$,
  '정말 비어 있는 행(공백 포함)은 여전히 통과한다'
);

select * from finish();
rollback;
