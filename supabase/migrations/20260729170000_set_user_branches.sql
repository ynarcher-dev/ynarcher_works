-- =====================================================================
-- [MANAGEMENT] 임직원 → 지사 역방향 배정 RPC (public.set_user_branches)
-- 설계: 지사 배정의 단일 원장은 그대로 branch_members 하나다. 지금까지는 '지사 관리'에서
--       지사 한 곳의 명단을 통째로 교체하는 방향(set_branch_members)만 있었으나,
--       인사 관리(임직원 상세 '수정')에서도 그 사람의 지사를 지정할 수 있어야 한다.
--       임직원 원장(users)에 지사 컬럼을 새로 두지 않는다 — 양쪽에 적으면 한쪽만 고쳐질 때 어긋난다.
--       인사 관리 화면은 사람 기준이라 지사를 하나만 고르지만(요소 0~1개), 원장은 다대다를 유지하므로
--       인자는 배열로 받는다 — 지사 기준 화면에서 한 사람을 여러 지사에 배정한 이력이 있어도 표현된다.
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
--   소유 ws=management(임직원 마스터) / 등급=Internal(사내 조직 배치) / Scope=global
--   - branch_members는 write RLS 정책 없음(Default Deny) → 쓰기 경로는 RPC 두 개뿐이다.
--   - 호출 권한 = app.is_admin() or app.can_write_workspace('management').
--     임직원 레코드를 고칠 수 있는 사람(users_update 정책과 동일 판정)이 그 사람의 지사도
--     지정한다 — 폼 한 장에서 저장되는 값의 권한이 서로 달라지면 부분 저장이 생긴다.
--     지사 원장 자체(지사명·주소·전화)의 쓰기는 여전히 admin 전용으로 남는다.
--   - SECURITY DEFINER: search_path 고정(app, public) + 함수 첫 줄에서 호출자 권한 검사.
--   - GRANT EXECUTE는 authenticated 한정(public revoke).
--   - 외부 역할 계정(external_*, temporary_guest)은 배정 대상에서 제외한다.
--   - 새 테이블·정책 없음(기존 branch_members 재사용) / DELETE 정책 없음(명단은 현재 상태라 RPC 내부 교체).
--   - 개인정보 원본·다운로드·Export·권한 변경이 아니라 사내 배치 정보라 audit_logs 미대상.
-- 근거: 20260728150000_branches.sql(set_branch_members·RPC 전용 쓰기 패턴),
--       20260708130000_employee_self_profile.sql(users_update = admin/management write)
-- =====================================================================

create or replace function public.set_user_branches(p_user_id uuid, p_branch_ids uuid[])
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if not (app.is_admin() or app.can_write_workspace('management')) then
    raise exception '지사 배정은 관리자 또는 인사 관리 권한자만 변경할 수 있습니다.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.users u
     where u.id = p_user_id
       and u.deleted_at is null
       and u.user_type::text not in ('external_startup', 'external_expert', 'temporary_guest')
  ) then
    raise exception '지사에 배정할 수 없는 계정입니다.' using errcode = '22023';
  end if;

  -- 해제: 인사 관리 폼이 보여주는 범위(활성 지사)에서 선택이 빠진 것만 지운다.
  -- 비활성·삭제된 지사의 기존 배정은 화면에 뜨지 않으므로 여기서 건드리지 않는다 —
  -- 보이지 않는 값을 저장 버튼 한 번으로 지우면 되살릴 근거가 남지 않는다.
  delete from public.branch_members m
   using public.branches b
   where m.user_id = p_user_id
     and b.id = m.branch_id
     and b.deleted_at is null
     and b.is_active
     and not (m.branch_id = any (coalesce(p_branch_ids, '{}'::uuid[])));

  -- 추가: 지사별 명단 맨 뒤에 붙인다. 이미 배정된 지사는 행을 그대로 두어
  -- '지사 관리'에서 잡아둔 표기 순서(sort_order)가 흔들리지 않게 한다.
  insert into public.branch_members (branch_id, user_id, sort_order)
  select b.id,
         p_user_id,
         coalesce(
           (select max(m2.sort_order) from public.branch_members m2 where m2.branch_id = b.id),
           0
         ) + 1
    from public.branches b
   where b.id = any (coalesce(p_branch_ids, '{}'::uuid[]))
     and b.deleted_at is null
     and b.is_active
  on conflict (branch_id, user_id) do nothing;
end $$;

revoke all on function public.set_user_branches(uuid, uuid[]) from public;
grant execute on function public.set_user_branches(uuid, uuid[]) to authenticated;

comment on function public.set_user_branches(uuid, uuid[]) is
  '임직원 한 명의 지사 배정 교체(인사 관리 경로). admin 또는 management write만 실행 가능(함수 내부 검사). '
  '활성 지사만 대상이며 비활성 지사의 기존 배정은 보존한다. set_branch_members()와 함께 branch_members의 유일한 쓰기 경로.';
