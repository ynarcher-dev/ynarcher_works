-- =====================================================================
-- 전사 일정 월간 생일 — 생년을 내보내지 않는 기간 조회 창구
--
-- 인사 관리의 hr_profiles.birth_date를 단일 원본으로 유지하면서, 캘린더에는 요청 구간에
-- 해당하는 생일의 '올해 날짜'만 답한다. SECURITY DEFINER는 비노출 app 스키마에 가두고,
-- PostgREST 진입점(public)은 SECURITY INVOKER 래퍼로 둔다.
--
-- 소유 ws=management(원장) / 등급=Personal / 접근=내부 사용자 read / 외부 게스트 차단
-- =====================================================================

create or replace function app.birthdays_in_range_impl(p_from date, p_to date)
returns table (
  user_id     uuid,
  user_name   text,
  birthday_on date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if app.current_app_user_id() is null or app.is_guest() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;

  -- 달력 그리드는 최대 6주다. 넉넉한 62일까지만 허용해 이 RPC가 생일 원장의 대량 추출
  -- 창구로 바뀌지 않게 한다. 끝은 다른 캘린더 조회와 동일한 반열린 구간이다.
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > 62 then
    raise exception '생일 조회 구간이 올바르지 않습니다.' using errcode = '22023';
  end if;

  return query
    select u.id, u.name, occurrence.birthday_on::date
      from generate_series(
             p_from::timestamp,
             (p_to - 1)::timestamp,
             interval '1 day'
           ) as occurrence(birthday_on)
      join public.hr_profiles h
        on (
          extract(month from h.birth_date) = extract(month from occurrence.birthday_on)
          and extract(day from h.birth_date) = extract(day from occurrence.birthday_on)
        )
        or (
          -- 평년에는 2월 29일생을 2월 말일(28일)에 표시한다.
          extract(month from h.birth_date) = 2
          and extract(day from h.birth_date) = 29
          and extract(month from occurrence.birthday_on) = 2
          and extract(day from occurrence.birthday_on) = 28
          and occurrence.birthday_on::date =
              (date_trunc('month', occurrence.birthday_on) + interval '1 month - 1 day')::date
        )
      join public.users u on u.id = h.user_id
     where h.birth_date is not null
       and u.is_active
       and u.deleted_at is null
       and not app.is_guest_user_type(u.user_type)
     order by occurrence.birthday_on, u.name;
end;
$$;

create or replace function public.birthdays_in_range(p_from date, p_to date)
returns table (
  user_id     uuid,
  user_name   text,
  birthday_on date
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from app.birthdays_in_range_impl(p_from, p_to);
$$;

revoke all on function app.birthdays_in_range_impl(date, date) from public, anon;
grant execute on function app.birthdays_in_range_impl(date, date) to authenticated;

revoke all on function public.birthdays_in_range(date, date) from public, anon;
grant execute on function public.birthdays_in_range(date, date) to authenticated;

comment on function app.birthdays_in_range_impl(date, date) is
  'MANAGEMENT 생년월일 원장을 읽는 비노출 구현. 내부 사용자 확인 및 최대 62일 제한을 강제한다.';

comment on function public.birthdays_in_range(date, date) is
  '요청 구간에 있는 재직 임직원의 생일을 해당 연도 날짜와 이름으로 반환한다. 출생연도는 반환하지 않는다.';
