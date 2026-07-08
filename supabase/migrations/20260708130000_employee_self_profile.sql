-- =====================================================================
-- [Phase 7] 임직원 본인 프로필 수정 경계 (마이페이지)
-- 목적: 본인은 "약력(bio)·노트(note)"만 수정 가능해야 한다. 그러나 users_update
--       정책의 self 절은 행 전체 UPDATE를 허용해 본인이 역할(user_type)·부서까지
--       바꿀 수 있었다. 컬럼 단위 강제를 위해:
--   1) users_update 정책에서 self 절 제거 → 본인 직접 UPDATE 차단
--      (admin / management write 만 임직원 레코드를 직접 수정)
--   2) public.update_my_profile(bio, note) RPC 신설 → 본인은 이 경로로만,
--      profile.bio / profile.note 두 키에 한해 갱신(컬럼 화이트리스트).
-- - 자료 업로드(마이페이지)는 기존 attachments insert 정책(uploaded_by = self)으로 커버.
--
-- 보안 게이트 체크리스트(11_migration_security_gate.md):
--  · 소유 워크스페이스: management(임직원 마스터) / 데이터 등급: Personal
--  · 접근 주체: 내부 임직원 본인(self) / Scope: self
--  · SELECT/INSERT/UPDATE 정책 분리 유지(본 변경은 users_update만 재정의)
--  · DELETE 정책 없음(soft delete 유지)
--  · 판정은 app.* 헬퍼 경유(app.is_admin/can_write_workspace/current_app_user_id)
--  · SECURITY DEFINER: search_path 고정(app, public) + 함수 내부 권한(현재 사용자) 확인
--  · GRANT EXECUTE 대상 authenticated 로 제한(public revoke)
--  · 개인정보 원본/다운로드/Export/권한변경 아님(본인 자기소개 텍스트 갱신) → 별도 감사로그 없음
-- 근거: 20260705120500_rls_enable_policies.sql(users_update),
--       20260705190000_admin_permission_rpc.sql(RPC 규약), 20260708120000_users_profile_columns.sql
-- =====================================================================

-- 1) users_update 재정의: self 직접 수정 제거(admin / management write 만) ---------
drop policy if exists users_update on public.users;
create policy users_update on public.users for update
  using (app.is_admin() or app.can_write_workspace('management'))
  with check (app.is_admin() or app.can_write_workspace('management'));

-- 2) 본인 프로필(약력·노트) 갱신 RPC -----------------------------------------------
-- 현재 로그인한 임직원 본인 행의 profile.bio / profile.note 만 갱신한다.
-- 나머지 profile 키(company/position 등)와 스칼라 컬럼(user_type/department_id 등)은 보존/불변.
create or replace function public.update_my_profile(
  p_bio  text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_uid uuid := app.current_app_user_id();
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  update public.users
     set profile = coalesce(profile, '{}'::jsonb)
                   || jsonb_build_object(
                        'bio',  nullif(btrim(p_bio), ''),
                        'note', nullif(btrim(p_note), '')
                      )
   where id = v_uid;
end;
$$;

revoke all on function public.update_my_profile(text, text) from public;
grant execute on function public.update_my_profile(text, text) to authenticated;
