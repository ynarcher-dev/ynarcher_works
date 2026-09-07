-- =====================================================================
-- M&A SELLER 원장 (public.ma_sellers) — 매각 희망 주체
--
-- 배경: 20260907120000이 인수를 희망하는 쪽(ma_buyers)을 세웠다. 딜은 사는 쪽과 파는 쪽이
--   만나야 열리는데 파는 쪽을 담을 자리가 없어, 매각 의향은 딜이 열리기 전까지 아무 데도
--   쌓이지 않았다. 바이어와 같은 성격(딜에 매달리지 않고 딜보다 먼저 쌓인다)이므로 같은
--   모양의 워크스페이스 원장 하나로 세운다.
--
-- **원장을 합치지 않고 나란히 두는 이유**는 다형 키다. 바이어 원장은 이미 자료·코멘트·
--   변동 이력·회의록 링크가 'ma_buyer'/'ma_buyers'라는 문자열로 가리키고 있어, 한 표로
--   합치려면 그 저장값들을 사후에 고쳐 써야 한다. 감사 성격의 기록을 나중에 고쳐 쓰는 것은
--   그때의 사실을 바꾸는 일이고(NETWORKS 통합에서 access_logs를 고치지 않은 것과 같은
--   이유), 합쳐서 얻는 것은 표 하나뿐이다 — 화면은 이미 한 벌을 공유한다
--   (features/mna/parties, 설정 주입).
--
-- 칸을 가르는 기준은 바이어와 같다(20260907120000·140000·150000):
--   목록을 좁히거나 정렬하는 값(분야·희망사항·가용자금)과 매번 같은 자리에서 꺼내 쓰는 값
--   (담당자·이메일)만 칸이 되고, 나머지 서술은 전부 본문(overview_html)이 받는다.
--   **가용자금 칸을 셀러에도 그대로 두는 것**이 요점이다 — 파는 쪽에서 이 칸이 답하는 것은
--   '얼마를 쓸 수 있나'가 아니라 '얼마 규모의 거래인가'(희망 매각가)이며, 목록을 세로로
--   견주는 축이 같은 자리에 같은 단위로 서야 두 원장을 오갈 때 눈이 같은 곳을 찾는다.
--   칸을 갈라 두면 화면도 두 벌이 된다.
--
-- 보안 게이트(11_migration_security_gate.md) 점검:
--   - 소유 워크스페이스: mna / 데이터 등급: Personal(담당자 이름·이메일) + Internal(나머지).
--   - 접근 주체: 내부 사용자만. 게스트는 mna 권한을 갖지 않아 can_read/write_workspace('mna')
--     에서 그대로 막힌다.
--   - Scope: workspace 단위(딜에 매이지 않는 원장이라 program 스코프를 쓰지 않는다).
--   - RLS 즉시 활성화, SELECT/INSERT/UPDATE 정책 분리, DELETE 정책 없음(soft delete).
--   - 권한 판정은 app.can_read_workspace()/app.can_write_workspace() 헬퍼 경유.
--   - 새 RPC 없음. SECURITY DEFINER 함수는 재작성이며(can_link_entity_target) search_path
--     고정과 authenticated 한정 grant를 유지한다.
--   - 개인정보(담당자명·이메일)는 화면이 마스킹 정책(콘텐츠 키 'mna.sellers')을 거쳐 렌더하고
--     원본 열람은 log_sensitive_access RPC가 사유와 함께 access_logs에 적재한다.
--   - 운영 모듈(program_module_id)에 딸린 원장이 아니므로 app.module_external_record() 분류 대상 아님.
-- 근거: docs/docs_planning/3_6_workspace_ma.md
-- =====================================================================

create table if not exists public.ma_sellers (
  id              uuid primary key default gen_random_uuid(),
  -- 기업명. 원장의 식별자라 잘리면 곤란한 값이고, 목록에서 남는 폭을 받는 열이다.
  name            text not null,
  -- 분야(industry_tags의 이름 배열, 최대 3). 목록을 좁히는 첫 축이다.
  industries      jsonb not null default '[]'::jsonb,
  -- 희망사항 한 줄(예: '경영권 포함 지분 전량 매각'). 자세한 조건은 본문이 받는다.
  wish            text,
  -- 거래 규모(원 단위 저장, 화면 표기는 백만원). 바이어의 '가용자금'과 같은 칸이며 파는
  -- 쪽에서는 희망 매각가를 뜻한다. 목록 정렬 축이다.
  available_funds numeric,
  -- 상세내용. 이 원장의 몸통이며 tiptap이 만든 HTML을 그대로 담는다.
  overview_html   text,
  -- 셀러 쪽 연락 창구다. 우리 쪽 관리 주체가 아니다 — 이 원장은 담당자 원장을 두지 않은
  -- 영구 공동관리(mna 쓰기 권한자 전원)이며 그 축은 컬럼이 아니라 정책이 답한다.
  contact_name    text,
  contact_email   text,
  -- STARTUP 원장 매핑(선택). 이름 칸을 대체하지 않고 옆에 붙는다.
  startup_id      uuid references public.startups(id),
  created_by      uuid references public.users(id) default app.current_app_user_id(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint ma_sellers_industries_array_chk check (jsonb_typeof(industries) = 'array'),
  -- 음수 금액은 값이 아니라 오타다. 0은 뜻이 있어 허용한다.
  constraint ma_sellers_available_funds_chk check (available_funds is null or available_funds >= 0)
);

comment on table public.ma_sellers is
  'M&A SELLER 원장 — 매각 희망 주체. 칸 구성·정책·다형 키 규약이 ma_buyers와 같고 화면도 한 벌을 공유한다.';
comment on column public.ma_sellers.industries is
  '분야(industry_tags 이름 배열, 최대 3). startups.industries와 같은 모양이라 태그 원장을 공유한다.';
comment on column public.ma_sellers.available_funds is
  '거래 규모(원 단위). 파는 쪽에서는 희망 매각가를 뜻한다 — 칸을 갈라 두면 목록·화면이 두 벌이 된다. 화면 표기는 백만원.';
comment on column public.ma_sellers.overview_html is
  '상세내용(리치텍스트 HTML). 매각 배경·희망 조건·미팅 메모 등 목록을 좁히지 않는 서술 전부.';
comment on column public.ma_sellers.contact_name is
  '셀러 쪽 연락 담당자명. 우리 쪽 관리 주체가 아니다 — 이 원장은 담당자 원장이 없는 영구 공동관리다.';
comment on column public.ma_sellers.contact_email is
  '셀러 쪽 담당자 이메일. 개인정보이므로 화면은 마스킹 정책(mna.sellers)을 거쳐 렌더한다.';
comment on column public.ma_sellers.startup_id is
  'STARTUP 원장 매핑(선택). 기업명은 여전히 자유 입력이며 이 칸은 "그 기업이 우리 원장의 어느 행인가"만 답한다. 열람 가능 여부는 startups의 SELECT 정책이 판정한다.';

-- 목록 쿼리 모양(soft delete 거르고 · 이름/희망사항 부분일치 · 최신 수정순 30건)에 맞춘
-- 부분 인덱스. 조건이 인덱스에 들어가 있어야 플래너가 쓴다(규약: 20260731220000).
create extension if not exists pg_trgm with schema extensions;

-- gin_trgm_ops가 실제로 설치된 스키마를 카탈로그에서 찾아 붙인다(규약: 20260731220000).
do $$
declare
  trgm_ops text;
begin
  select quote_ident(n.nspname) || '.gin_trgm_ops'
    into trgm_ops
    from pg_opclass o
    join pg_namespace n on n.oid = o.opcnamespace
    join pg_am a on a.oid = o.opcmethod
   where o.opcname = 'gin_trgm_ops' and a.amname = 'gin'
   limit 1;

  if trgm_ops is null then
    raise exception 'pg_trgm 확장의 gin_trgm_ops를 찾을 수 없습니다 — 확장 설치를 먼저 확인하세요.';
  end if;

  execute format(
    'create index if not exists idx_ma_sellers_name_trgm on public.ma_sellers using gin (name %s) where deleted_at is null',
    trgm_ops
  );
  execute format(
    'create index if not exists idx_ma_sellers_wish_trgm on public.ma_sellers using gin (wish %s) where deleted_at is null',
    trgm_ops
  );
end $$;

create index if not exists idx_ma_sellers_updated_at
  on public.ma_sellers (updated_at desc)
  where deleted_at is null;

create index if not exists idx_ma_sellers_startup_id
  on public.ma_sellers (startup_id)
  where deleted_at is null and startup_id is not null;

drop trigger if exists trg_ma_sellers_updated_at on public.ma_sellers;
create trigger trg_ma_sellers_updated_at
  before update on public.ma_sellers
  for each row execute function app.set_updated_at();

-- 변동 이력은 화면이 아니라 원장이 남긴다. 트리거가 붙으면
-- app.has_contribution_trigger('ma_sellers')가 참이 되어 update_entity·deactivate_entity
-- RPC가 이 원장을 받는다(그 둘은 손으로 적은 허용 목록이 아니라 트리거 존재를 카탈로그에서
-- 확인한다) — 그래서 수정·삭제 사유가 이력의 note로 남는다.
drop trigger if exists trg_ma_sellers_contribution on public.ma_sellers;
create trigger trg_ma_sellers_contribution
  after insert or update on public.ma_sellers
  for each row execute function app.log_entity_contribution('ma_sellers');

-- RLS — 즉시 활성화 + SELECT/INSERT/UPDATE 분리, DELETE 정책 없음(soft delete).
-- 딜 접근(can_access_ws_program)을 걸지 않는 이유는 바이어와 같다: 이 원장은 딜에 매달린
-- 것이 아니라 딜보다 먼저 쌓이는 것이라, 딜 담당이 아니면 못 보는 규칙은 원장을 쌓지
-- 못하게 만든다.
alter table public.ma_sellers enable row level security;

drop policy if exists ma_sellers_select on public.ma_sellers;
create policy ma_sellers_select on public.ma_sellers for select
  using (app.can_read_workspace('mna'));

drop policy if exists ma_sellers_insert on public.ma_sellers;
create policy ma_sellers_insert on public.ma_sellers for insert
  with check (app.can_write_workspace('mna'));

drop policy if exists ma_sellers_update on public.ma_sellers;
create policy ma_sellers_update on public.ma_sellers for update
  using (app.can_write_workspace('mna'))
  with check (app.can_write_workspace('mna'));

-- ---------------------------------------------------------------------
-- 다형 키 배선 — 자료·코멘트·변동 이력·회의록 링크가 이 원장을 가리킬 수 있게 한다.
--
-- 키는 둘이다(20260907130000과 같은 규약). 기여 로그의 entity_table은 표 이름(ma_sellers)
-- 이고 — 트리거 인자가 그 값이며 update_entity/deactivate_entity가 표로 찾는다 —
-- 자료·피드백·회의록 링크의 target_type은 단수 키(ma_seller)다.
-- ---------------------------------------------------------------------
create or replace function app.entity_key_workspace(p_entity_key text)
returns text
language sql
immutable
set search_path = app, public
as $fn$
  select case p_entity_key
           when 'program'         then 'ac'
           when 'ma_program'      then 'mna'
           when 'project_program' then 'project'
           when 'fund'            then 'fund'
           when 'startups'        then 'startup'
           when 'startup'         then 'startup'
           when 'ma_buyers'       then 'mna'
           when 'ma_buyer'        then 'mna'
           when 'ma_sellers'      then 'mna'
           when 'ma_seller'       then 'mna'
           else 'networks'
         end;
$fn$;

comment on function app.entity_key_workspace(text) is
  '다형 키(entity_table/target_type) → 소유 워크스페이스 키. 한 워크스페이스가 성격이 다른 원장 여럿을 가질 수 있으므로(mna: 딜 ma_program + 바이어 ma_buyer + 셀러 ma_seller) 이 함수만으로는 판정이 끝나지 않는다 — id가 스코프인지 원장 행인지는 app.entity_key_workspace_scoped()가 답한다.';

-- 이 키의 id는 접근 스코프가 아니라 그냥 원장 행이다(워크스페이스 권한 하나로 판정이 끝난다).
-- 여기 넣지 않으면 정책이 can_access_ws_program('mna', <셀러 id>)에 걸려 언제나 거짓이 되고,
-- 그 원장의 다형 패널 넷은 오류 없이 조용히 빈다.
create or replace function app.entity_key_workspace_scoped(p_entity_key text)
returns boolean
language sql
immutable
set search_path = app, public
as $fn$
  select p_entity_key in (
    'networks', 'network',
    'startups', 'startup',
    'ma_buyers', 'ma_buyer',
    'ma_sellers', 'ma_seller'
  );
$fn$;

grant execute on function app.entity_key_workspace_scoped(text) to authenticated;

comment on function app.entity_key_workspace_scoped(text) is
  '이 다형 키의 id가 접근 스코프가 아니라 그냥 원장 행인가. 참이면 워크스페이스 권한 하나로 판정이 끝나고, 거짓이면 레코드 판정(can_access_ws_program/can_access_fund)이 한 겹 더 붙는다. 원장을 더할 때 여기 넣지 않으면 그 원장의 다형 패널은 오류 없이 조용히 빈다.';

-- 회의록 연동 — 대상 종류에 ma_seller 추가.
-- 외부 참석자(EXTERNAL_ATTENDEE) 제약은 건드리지 않는다: 회의에 오는 것은 사람이고 사람은
-- 네트워크 원장에 있다. 셀러는 기업 원장이라 '이 회의가 다룬 대상'(SUBJECT)으로만 걸린다.
alter table public.meeting_minute_links
  drop constraint if exists meeting_minute_links_target_type_check;
alter table public.meeting_minute_links
  add constraint meeting_minute_links_target_type_check
  check (target_type in (
    'program', 'ma_program', 'project_program', 'startup', 'fund', 'network',
    'ma_buyer', 'ma_seller'
  ));

comment on constraint meeting_minute_links_target_type_check on public.meeting_minute_links is
  '연동 대상 다형 키. 프론트 MINUTE_LINK_TARGET_TYPES(minuteLinks.ts)와 값이 정확히 일치해야 한다.';

create or replace function app.can_link_entity_target(p_target_type text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $fn$
  select case p_target_type
    when 'program' then
      app.can_read_workspace('ac') and app.can_access_ws_program('ac', p_target_id)
      and exists (select 1 from public.programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'ma_program' then
      app.can_read_workspace('mna') and app.can_access_ws_program('mna', p_target_id)
      and exists (select 1 from public.ma_programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'project_program' then
      app.can_read_workspace('project') and app.can_access_ws_program('project', p_target_id)
      and exists (select 1 from public.project_programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'startup' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.startups x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'network' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.networks x
                   where x.id = p_target_id and x.deleted_at is null and x.merged_into_id is null)
    when 'ma_buyer' then
      app.can_read_workspace('mna')
      and exists (select 1 from public.ma_buyers x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'ma_seller' then
      app.can_read_workspace('mna')
      and exists (select 1 from public.ma_sellers x
                   where x.id = p_target_id and x.deleted_at is null)
    else false
  end;
$fn$;

revoke all on function app.can_link_entity_target(text, uuid) from public;
grant execute on function app.can_link_entity_target(text, uuid) to authenticated;

comment on function app.can_link_entity_target(text, uuid) is
  '요청자가 연동 대상 원장 행을 열람 가능한가(각 원장 SELECT 정책 재현 + 소프트삭제·병합·미존재 배제). 회의록 연동·결재 프로젝트 연동이 공유한다.';
