-- =====================================================================
-- 오늘 생일인 임직원 — 연도를 답하지 않는 조회 창구 하나
--
-- 생년월일(hr_profiles.birth_date)은 MANAGEMENT 전용이고, 그 원장을 만든
-- 20260911110813이 "users/profile이나 OFFICE 디렉토리에 복제하지 않는다"고 못 박았다.
-- 그래서 전사 캘린더의 생일 카드는 원장을 읽지 않는다 — 이 함수 하나만 두드린다.
--
-- 민감한 것은 생일이 아니라 **생년**(나이·주민등록번호 앞자리)이므로, 나가는 값에서 날짜를
-- 통째로 뺀다. 답하는 것은 "오늘이 생일인 사람의 이름"뿐이고 월·일조차 함수 밖으로 나오지
-- 않는다. 그 좁힘 덕분에 인사 권한이 없는 내부 사용자도 카드를 볼 수 있으면서 원장은 잠긴 채다.
--
-- 소유 ws=management(원장) / 등급=Personal / 접근=내부 사용자 read / 외부 게스트 차단
-- =====================================================================

create or replace function public.today_birthdays()
returns table (
  user_id   uuid,
  user_name text
)
language plpgsql
stable
security definer
set search_path = app, public
as $$
#variable_conflict use_column
declare
  v_today    date := app.kst_today();
  v_feb_last boolean;
begin
  -- SECURITY DEFINER로 MANAGEMENT 원장을 읽으므로 호출자 자격을 함수 안에서 먼저 확인한다.
  -- 게스트를 조용히 빈 목록으로 돌려보내지 않고 막는 이유는, 이 함수가 열려 있다는 사실
  -- 자체가 외부 계정에게 답할 물음이 아니기 때문이다.
  if app.current_app_user_id() is null or app.is_guest() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;

  -- 평년의 2월 28일인가. 2월 29일생은 그날 함께 선다(민법 제160조의 '말일' 기준) — 그러지
  -- 않으면 4년에 세 번 그 사람의 생일이 어디에도 서지 않는다.
  v_feb_last := extract(month from v_today) = 2
                and extract(day from v_today) = 28
                and v_today = (date_trunc('month', v_today) + interval '1 month - 1 day')::date;

  return query
    select u.id, u.name
    from public.hr_profiles h
    join public.users u on u.id = h.user_id
    where h.birth_date is not null
      -- 재직 중인 내부 임직원만. 게스트는 hr_profiles를 갖지 않지만, 유형 판정을 함께 걸어
      -- 그 전제가 깨지는 날에도 이 창구로는 새지 않게 한다.
      and u.is_active
      and u.deleted_at is null
      and not app.is_guest_user_type(u.user_type)
      and (
        (extract(month from h.birth_date) = extract(month from v_today)
         and extract(day from h.birth_date) = extract(day from v_today))
        or (v_feb_last
            and extract(month from h.birth_date) = 2
            and extract(day from h.birth_date) = 29)
      )
    order by u.name;
end;
$$;

-- Supabase 기본 권한이 함수에 anon까지 얹으므로 PUBLIC과 함께 걷는다 — 이 창구는 로그인한
-- 내부 사용자만 두드린다.
revoke all on function public.today_birthdays() from public, anon;
grant execute on function public.today_birthdays() to authenticated;

comment on function public.today_birthdays() is
  '오늘(KST) 생일인 재직 임직원의 id와 이름. 생년월일은 MANAGEMENT 전용 hr_profiles에 잠긴 채로 두고 '
  '이 창구는 연도·월·일 어느 것도 답하지 않는다. 외부 게스트·비로그인은 42501로 막는다.';
