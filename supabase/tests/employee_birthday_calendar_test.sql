begin;
select plan(9);

insert into public.users (id, user_type, name, session_version)
values
  ('97100000-0000-0000-0000-000000000001', 'mna_manager', '생일 조회자', 1),
  ('97100000-0000-0000-0000-000000000002', 'ac_business', '염재민', 1),
  ('97100000-0000-0000-0000-000000000003', 'ac_business', '윤윤년', 1),
  ('97100000-0000-0000-0000-000000000004', 'temporary_guest', '외부 게스트', 1),
  ('97100000-0000-0000-0000-000000000005', 'ac_business', '비활성 임직원', 1);

update public.users
   set is_active = false
 where id = '97100000-0000-0000-0000-000000000005';

insert into public.hr_profiles (user_id, birth_date)
values
  ('97100000-0000-0000-0000-000000000002', date '1992-08-19'),
  ('97100000-0000-0000-0000-000000000003', date '1996-02-29'),
  ('97100000-0000-0000-0000-000000000004', date '1990-08-19'),
  ('97100000-0000-0000-0000-000000000005', date '1991-08-19');

select ok(
  has_function_privilege(
    'authenticated',
    'public.birthdays_in_range(date,date)',
    'EXECUTE'
  ),
  '로그인 사용자는 기간 생일 RPC를 실행할 수 있다'
);

select ok(
  not has_function_privilege('anon', 'public.birthdays_in_range(date,date)', 'EXECUTE'),
  '익명 사용자는 기간 생일 RPC를 실행할 수 없다'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"97100000-0000-0000-0000-000000000001","session_version":1}',
  true
);

select is(
  (select user_name from public.birthdays_in_range(date '2026-07-26', date '2026-09-06')
    where birthday_on = date '2026-08-19'),
  '염재민',
  '인사 관리의 1992-08-19가 조회 연도의 8월 19일 생일로 반영된다'
);

select is(
  (select birthday_on::text from public.birthdays_in_range(date '2026-08-01', date '2026-09-01')
    where user_id = '97100000-0000-0000-0000-000000000002'),
  '2026-08-19',
  '응답은 출생연도 대신 조회 연도의 생일 날짜만 반환한다'
);

select is(
  (select count(*)::integer
     from public.birthdays_in_range(date '2026-08-01', date '2026-09-01')
    where user_name in ('외부 게스트', '비활성 임직원')),
  0,
  '게스트와 비활성 임직원은 생일 캘린더에 표시하지 않는다'
);

select is(
  (select birthday_on::text from public.birthdays_in_range(date '2026-02-01', date '2026-03-01')
    where user_id = '97100000-0000-0000-0000-000000000003'),
  '2026-02-28',
  '평년의 2월 29일생은 2월 말일에 표시한다'
);

select is(
  (select birthday_on::text from public.birthdays_in_range(date '2028-02-01', date '2028-03-01')
    where user_id = '97100000-0000-0000-0000-000000000003'),
  '2028-02-29',
  '윤년의 2월 29일생은 실제 2월 29일에 표시한다'
);

select throws_ok(
  $$select * from public.birthdays_in_range(date '2026-01-01', date '2026-04-01')$$,
  '22023',
  null,
  '62일을 넘는 대량 조회는 거절한다'
);

select set_config(
  'request.jwt.claims',
  '{"app_user_id":"97100000-0000-0000-0000-000000000004","session_version":1}',
  true
);

select throws_ok(
  $$select * from public.birthdays_in_range(date '2026-08-01', date '2026-09-01')$$,
  '42501',
  null,
  '외부 게스트의 생일 조회는 함수 안에서도 거절한다'
);

select * from finish();
rollback;
