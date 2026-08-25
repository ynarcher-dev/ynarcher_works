-- =====================================================================
-- [OFFICE] 퀵 메모·체크리스트 원장 — localStorage에서 서버로 승격
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
--   소유 ws=office / 등급=Personal / 접근=내부 임직원 / Scope=self(본인 행만)
--   - 생성 즉시 RLS 활성화, SELECT/INSERT/UPDATE 정책 분리.
--   - DELETE 정책 없음(soft delete: deleted_at).
--   - 권한 판정은 app.current_app_user_id()/app.is_internal_user() 헬퍼만 경유.
--   - SECURITY DEFINER 스탬프 트리거는 search_path 고정.
--   - 감사 로그 경로 없음: 개인정보 원본·파일 다운로드·Export·권한 변경이 없고,
--     본인 외에는 아무도(관리자 포함) 읽을 수 없어 추적 대상 행위가 성립하지 않는다.
-- 근거: 20260707240000_entity_feedback.sql(작성자 스탬프·soft delete),
--       20260728120000_meeting_rooms.sql(app.is_internal_user 헬퍼),
--       20260803190000_attendance.sql(self scope 정책 분리)
--
-- 설계 메모:
--   - 이 원장은 상단바 '퀵 메모' 슬라이드오버와 OFFICE 대시보드 체크리스트 카드가
--     함께 쓰던 브라우저 localStorage를 대체한다. 브라우저·포트(오리진)·기기가 바뀌면
--     통째로 사라지고 백업도 없던 자리라, 저장소를 DB로 옮긴다.
--   - **관리자도 남의 메모를 읽지 못한다.** 다른 업무 원장과 달리 정책에 is_admin()
--     우회를 두지 않는다 — 개인 낙서장이라 관리자 열람의 업무적 근거가 없고,
--     열어 두면 그 순간 Personal 등급 데이터의 전사 조회 경로가 하나 생긴다.
--   - 체크리스트 항목은 자식 테이블이 아니라 items jsonb 한 컬럼에 담는다. 항목 단위의
--     검색·집계·권한이 없고 저장 단위가 언제나 '메모 한 장 통째'여서, 쪼개면 순서 컬럼과
--     삭제 동기화만 늘고 얻는 것이 없다. 항목 단위 질의가 생기면 그때 승격한다.
-- =====================================================================

-- 1. 메모 종류 enum ----------------------------------------------------
do $$
begin
  create type public.quick_memo_type as enum ('NOTE', 'CHECKLIST');
exception when duplicate_object then null;
end $$;

-- 2. 원장 --------------------------------------------------------------
create table if not exists public.quick_memos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id),  -- 소유자(트리거 스탬프, 클라이언트 입력 불신)
  type       public.quick_memo_type not null,
  title      text not null default '',
  content    text not null default '',                   -- NOTE 본문(체크리스트는 빈 문자열)
  items      jsonb not null default '[]'::jsonb,         -- [{id, content, completed}] — CHECKLIST 항목
  pinned     boolean not null default false,
  color      text not null default 'cream',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint quick_memos_items_is_array check (jsonb_typeof(items) = 'array'),
  constraint quick_memos_color_check
    check (color in ('cream', 'rose', 'blue', 'mint', 'lavender'))
);

comment on table public.quick_memos is
  '상단바 퀵 메모·OFFICE 대시보드 체크리스트의 개인 원장(본인만 조회·수정, 관리자 열람 없음)';
comment on column public.quick_memos.items is
  'CHECKLIST 항목 배열 [{id: uuid, content: text, completed: bool}] — 순서가 곧 화면 순서';

-- 목록 정렬(고정 우선 · 최근 수정 순)을 그대로 태우는 부분 인덱스.
create index if not exists idx_quick_memos_user
  on public.quick_memos (user_id, pinned desc, updated_at desc)
  where deleted_at is null;

-- 3. RLS ---------------------------------------------------------------
alter table public.quick_memos enable row level security;

-- 조회: 본인 행만. 관리자 우회 없음(위 설계 메모).
drop policy if exists quick_memos_select on public.quick_memos;
create policy quick_memos_select on public.quick_memos for select
  using (user_id = app.current_app_user_id());

-- 작성: 내부 사용자가 본인 명의로만. user_id는 아래 트리거가 무조건 덮어쓰므로
-- with check는 그 결과를 재확인하는 두 번째 자물쇠다.
drop policy if exists quick_memos_insert on public.quick_memos;
create policy quick_memos_insert on public.quick_memos for insert
  with check (
    app.is_internal_user()
    and user_id = app.current_app_user_id()
  );

-- 수정·삭제(soft): 본인 행만. 소유자 이전 경로를 막기 위해 with check도 본인으로 고정한다.
drop policy if exists quick_memos_update on public.quick_memos;
create policy quick_memos_update on public.quick_memos for update
  using (user_id = app.current_app_user_id())
  with check (user_id = app.current_app_user_id());

-- DELETE 정책 없음(Default Deny) — 삭제는 deleted_at UPDATE로만 한다.

-- 4. 트리거 ------------------------------------------------------------
drop trigger if exists trg_quick_memos_updated_at on public.quick_memos;
create trigger trg_quick_memos_updated_at
  before update on public.quick_memos
  for each row execute function app.set_updated_at();

-- 소유자 스탬프: 조건 없이 현재 앱 사용자로 덮어쓴다. 개인 원장이라 남의 명의로 넣을
-- 정당한 경우가 없고, 비워 두면 not null 위반으로 넘어가지 못한다.
create or replace function app.stamp_quick_memo_owner()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  NEW.user_id := app.current_app_user_id();
  return NEW;
end $$;

drop trigger if exists trg_quick_memos_owner on public.quick_memos;
create trigger trg_quick_memos_owner
  before insert on public.quick_memos
  for each row execute function app.stamp_quick_memo_owner();
