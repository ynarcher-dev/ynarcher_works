-- ---------------------------------------------------------------------
-- 사업 참가자 목록 원장 — '누가 참가하는가' 한 축만 지는 표
--
-- **왜 `program_participants`를 그대로 쓰지 않는가.** 그 원장은 참가 사실과 **게스트 로그인**
-- 을 한 행에 함께 지고 있다(login_status·user_id·access_*). 그래서 담당자가 참가 기업 하나를
-- 담는 순간 화면이 "이 사람에게 게스트 계정이 있다"고 말하기 시작하고, GUEST를 쓰지 않는
-- 사업에서도 그 말이 먼저 선다 — 실제로 담당자들이 그 지점에서 혼란스러워했다.
--
-- 그래서 축을 가른다. **참가자 목록은 이 원장이 답하고**(추가·삭제만 있는 명단), 게스트 계정은
-- 다음 라운드에서 **이 명단에서 골라 만드는** 별개의 결정이 된다 — 자동 생성이 아니다.
-- 자동으로 세우면 지금과 똑같은 자리로 돌아온다(담는 순간 계정이 생기고, 화면이 GUEST를
-- 쓰지 않는 사업에서도 계정 이야기를 먼저 한다). 명단에 담는 것과 문을 여는 것은 두 결정이고,
-- 두 번째 결정은 담당자가 명단을 보고 골라서 한다.
-- 즉 `program_participants`는 앞으로 '참가 사실'이 아니라 '게스트 문(門)'을 뜻하게 된다.
-- 여기서 그 원장을 손대지 않는 이유는, 지금 사는 화면(GUEST 설정 모달)이 그대로 돌아야
-- 하기 때문이다. 두 원장이 겹치는 기간이 있고, 합류는 계정 자동생성을 세우는 라운드의 일이다.
--
-- **값은 복제하지 않고 원장을 가리킨다.** 기업명·대표자·이메일·연락처는 STARTUP·NETWORKS·
-- M&A 원장이 소유하고 화면이 조회로 합성한다 — 복제하면 원장을 고친 날 이 목록만 옛 값을
-- 들고, 어느 쪽이 사실인지 판정할 근거가 없다. 원장에 없는 사람을 직접 적어 넣는 '직접등록'은
-- 다음 라운드의 일이며, 그때 값 칸과 `source` 축이 이 표에 더해진다(가산 마이그레이션).
--
-- **소프트 삭제.** 명단에서 빼는 일은 업무 기록을 지우는 일이라 `deleted_at`으로 접는다.
-- 뺐다가 다시 담는 일이 흔하므로 유일 제약은 살아 있는 행에만 건다(부분 인덱스).
--
-- 소유 워크스페이스: ac / mna (행마다 `entity_key`가 답한다)
-- 데이터 등급: Internal (개인정보 값 자체는 원장이 갖고 이 표는 참조만 든다)
-- 접근 주체: 내부 사용자만 — 게스트 정책을 만들지 않는다(게스트가 볼 목록이 아니다)
-- Scope 기준: program
-- 감사 로그: 대상 아님(원본 개인정보·다운로드·권한 변경 경로가 없다)
-- ---------------------------------------------------------------------

create table if not exists public.program_participant_entries (
  id           uuid primary key default gen_random_uuid(),
  -- 소속 워크스페이스. 사업 원장이 둘(programs/ma_programs)이라 program_id만으로는 답이 안 된다.
  entity_key   text not null,
  -- FK를 걸 수 없다(가리킬 원장이 둘) — 실재는 app.enforce_program_ref() 트리거가 확인하고,
  -- 사업이 물리 삭제될 때의 연쇄는 app.cascade_program_children()이 대신한다.
  program_id   uuid not null,
  -- 이 줄의 자격이자 원장 출처. 스타트업/전문가(AC), SELLER/BUYER(M&A).
  master_table text not null,
  master_id    uuid not null,
  -- 어떤 권한도 주지 않는 서술 값. 화면이 보내지 않고 트리거가 찍는다.
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

comment on table public.program_participant_entries is
  '사업 참가자 목록(명단). 참가 사실 한 축만 지며 게스트 계정·로그인과 갈려 있다. 값은 원장(startups/networks/ma_sellers/ma_buyers)이 소유하고 여기서는 참조만 든다.';
comment on column public.program_participant_entries.entity_key is
  '소유 원장: program(AC) | ma_program(M&A).';
comment on column public.program_participant_entries.master_table is
  '이 줄의 자격이자 원장 출처. 값 목록은 program_participants·guest_identities의 CHECK와 한 벌로 움직인다 — 자격을 하나 열 때 세 곳을 같은 커밋에서 연다.';
comment on column public.program_participant_entries.deleted_at is
  '명단에서 뺀 시각(소프트 삭제). 유일 제약은 살아 있는 행에만 걸리므로 뺀 대상을 다시 담을 수 있다.';

alter table public.program_participant_entries
  drop constraint if exists program_participant_entries_entity_key_check;
alter table public.program_participant_entries
  add constraint program_participant_entries_entity_key_check
  check (entity_key = any (array['program'::text, 'ma_program'::text]));

alter table public.program_participant_entries
  drop constraint if exists program_participant_entries_master_table_check;
alter table public.program_participant_entries
  add constraint program_participant_entries_master_table_check
  check (master_table = any (array['startups'::text, 'networks'::text,
                                   'ma_sellers'::text, 'ma_buyers'::text]));

-- 한 사업에 같은 원장 행은 한 줄. 뺀 줄(deleted_at)은 제약에서 빠지므로 다시 담을 수 있다.
create unique index if not exists uq_program_participant_entries_live
  on public.program_participant_entries (entity_key, program_id, master_table, master_id)
  where deleted_at is null;

create index if not exists idx_program_participant_entries_program
  on public.program_participant_entries (entity_key, program_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------
-- RLS — 읽기/쓰기 모두 그 사업에 닿을 수 있는 내부 사용자만.
--       DELETE 정책은 만들지 않는다(소프트 삭제는 UPDATE다).
-- ---------------------------------------------------------------------
alter table public.program_participant_entries enable row level security;

drop policy if exists program_participant_entries_select on public.program_participant_entries;
create policy program_participant_entries_select on public.program_participant_entries
  for select using (
    app.can_read_workspace(app.entity_key_workspace(entity_key))
    and app.can_access_ws_program(app.entity_key_workspace(entity_key), program_id)
  );

drop policy if exists program_participant_entries_insert on public.program_participant_entries;
create policy program_participant_entries_insert on public.program_participant_entries
  for insert with check (
    app.can_write_workspace(app.entity_key_workspace(entity_key))
    and app.can_access_ws_program(app.entity_key_workspace(entity_key), program_id)
  );

drop policy if exists program_participant_entries_update on public.program_participant_entries;
create policy program_participant_entries_update on public.program_participant_entries
  for update using (
    app.can_write_workspace(app.entity_key_workspace(entity_key))
    and app.can_access_ws_program(app.entity_key_workspace(entity_key), program_id)
  ) with check (
    app.can_write_workspace(app.entity_key_workspace(entity_key))
    and app.can_access_ws_program(app.entity_key_workspace(entity_key), program_id)
  );

-- ---------------------------------------------------------------------
-- 트리거 — 참조 무결성 · updated_at · 생성자 각인
-- ---------------------------------------------------------------------
drop trigger if exists trg_program_participant_entries_program_ref
  on public.program_participant_entries;
create trigger trg_program_participant_entries_program_ref
  before insert or update of entity_key, program_id
  on public.program_participant_entries
  for each row execute function app.enforce_program_ref();

drop trigger if exists trg_program_participant_entries_updated_at
  on public.program_participant_entries;
create trigger trg_program_participant_entries_updated_at
  before update on public.program_participant_entries
  for each row execute function app.set_updated_at();

-- 생성자 각인은 명부가 쓰던 함수를 그대로 쓴다 — 하는 일이 `created_by`를 채우는 것뿐이라
-- 원장에 매이지 않는다. 복제하면 규칙이 두 곳에 살고 한쪽만 고쳐지는 날이 온다.
drop trigger if exists trg_program_participant_entries_stamp
  on public.program_participant_entries;
create trigger trg_program_participant_entries_stamp
  before insert on public.program_participant_entries
  for each row execute function app.stamp_participant_insert();

-- ---------------------------------------------------------------------
-- 사업 물리 삭제 시 연쇄 — FK를 뗀 자리를 메우는 장치.
-- 운영에서 사업은 소프트 삭제되므로 실제로는 시드 정리 경로에서만 탄다.
-- ---------------------------------------------------------------------
create or replace function app.cascade_program_children()
returns trigger
language plpgsql
set search_path = app, public
as $fn$
declare
  v_key text := tg_argv[0];
begin
  -- 자식(assignees·내용물)은 program_modules FK의 on delete cascade가 이어서 지운다.
  delete from public.program_modules       where entity_key = v_key and program_id = old.id;
  delete from public.program_posts         where entity_key = v_key and program_id = old.id;
  delete from public.program_links         where entity_key = v_key and program_id = old.id;
  delete from public.program_participants  where entity_key = v_key and program_id = old.id;
  delete from public.program_overviews     where entity_key = v_key and program_id = old.id;
  delete from public.program_announcements where entity_key = v_key and program_id = old.id;
  delete from public.program_questions     where entity_key = v_key and program_id = old.id;
  delete from public.program_participant_entries
         where entity_key = v_key and program_id = old.id;
  return old;
end;
$fn$;
