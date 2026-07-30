-- =====================================================================
-- 조직을 삭제하면 그 조직의 인력 배치도 함께 끊는다.
--
-- 조직 삭제는 soft delete(departments.deleted_at)라 dept_members 행이 그대로 남아 있었다.
-- 그 결과 없는 조직 소속인 사람이 생겨, 인력 배치 화면에는 사라진 팀 이름이 "현재 소속"으로
-- 계속 뜨고 인사 컬럼도 유령 조직을 가리켰다.
--
-- 끊는 일을 화면이 아니라 DB에 두는 이유는 원자성이다 — 화면에서 사람 수만큼 요청을 돌리면
-- 중간에 끊겼을 때 절반만 정리된 상태가 남고, 임포터·RPC 등 다른 경로로 삭제하면 아예 누락된다.
--
-- 버전 안전성: departments는 조직 버전별로 행이 따로 있고 dept_members·users.department_id는
-- 모두 그 행 id를 가리키므로, 예정(초안) 버전의 조직을 지워도 현재 운영 배치는 건드리지 않는다.
-- =====================================================================

-- 1) 이미 남아 있는 배치 정리 --------------------------------------------------
update public.dept_members m
   set deleted_at = now()
  from public.departments d
 where d.id = m.department_id
   and m.deleted_at is null
   and d.deleted_at is not null;

-- 활성 버전 미러(users.department_id)도 같은 기준으로 비운다.
update public.users u
   set department_id = null
  from public.departments d
 where d.id = u.department_id
   and d.deleted_at is not null;

-- 2) 앞으로는 삭제 시점에 함께 끊는다 -------------------------------------------
-- SECURITY INVOKER(기본): 호출자 권한으로 실행되므로 dept_members·users의 RLS가 그대로 적용된다.
-- DEFINER로 만들면 조직 삭제 권한만으로 남의 소속을 고칠 수 있는 우회로가 된다.
create or replace function app.clear_dept_members_on_dept_delete()
returns trigger
language plpgsql
set search_path = app, public
as $$
begin
  update public.dept_members
     set deleted_at = now()
   where department_id = new.id
     and deleted_at is null;

  update public.users
     set department_id = null
   where department_id = new.id;

  return new;
end;
$$;

comment on function app.clear_dept_members_on_dept_delete() is
  '조직 soft delete 시 해당 조직의 인력 배치(dept_members)와 활성 버전 미러(users.department_id)를 함께 끊는다.';

drop trigger if exists trg_departments_clear_members on public.departments;
create trigger trg_departments_clear_members
  after update of deleted_at on public.departments
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function app.clear_dept_members_on_dept_delete();
