-- =====================================================================
-- 임직원 생년월일 — MANAGEMENT 전용 인사 민감정보
--
-- users/profile은 OFFICE 임직원 디렉토리를 포함한 전 내부 사용자에게 열려 있으므로 생년월일을
-- 그곳에 두지 않는다. 이미 MANAGEMENT RLS가 적용된 hr_profiles에만 보관한다.
-- 소유 ws=management / 등급=Sensitive / 접근=management read·write / 외부 게스트 차단
-- =====================================================================

alter table public.hr_profiles
  add column if not exists birth_date date,
  add constraint hr_profiles_birth_date_not_future
    check (birth_date is null or birth_date <= current_date);

comment on column public.hr_profiles.birth_date is
  '임직원 생년월일. MANAGEMENT 임직원 정보 전용이며 users/profile이나 OFFICE 디렉토리에 복제하지 않는다.';

-- 기존 정책도 같은 조건이지만 인증 역할을 명시해 익명 호출 경계를 분명히 한다.
drop policy if exists hr_profiles_mgmt_select on public.hr_profiles;
create policy hr_profiles_mgmt_select on public.hr_profiles
  for select to authenticated
  using (app.can_read_workspace('management'));

drop policy if exists hr_profiles_mgmt_insert on public.hr_profiles;
create policy hr_profiles_mgmt_insert on public.hr_profiles
  for insert to authenticated
  with check (app.can_write_workspace('management'));

drop policy if exists hr_profiles_mgmt_update on public.hr_profiles;
create policy hr_profiles_mgmt_update on public.hr_profiles
  for update to authenticated
  using (app.can_write_workspace('management'))
  with check (app.can_write_workspace('management'));

revoke all on table public.hr_profiles from anon;
grant select, insert, update on table public.hr_profiles to authenticated;
