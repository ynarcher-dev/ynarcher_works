-- =====================================================================
-- M&A BUYER 원장 (public.ma_buyers)
--
-- 배경: M&A/PE에는 딜 원장(ma_programs)만 있고 "인수를 희망하는 쪽"을 모아 두는 자리가
--   없었다. 딜이 열리기 전에 먼저 쌓이는 것이 바이어이므로, 딜에 매달지 않고 워크스페이스
--   원장 하나로 세운다(스코프 컬럼이 program_id가 아니라 없다 — NETWORKS와 같은 성격이다).
--
-- 칸을 가르는 기준: 원장에 칸으로 남는 것은 **목록을 좁히거나 정렬하는 값**뿐이다.
--   분야로 좁히고 가용자금으로 줄을 세운다. 나머지(인수 배경·희망 조건·미팅 메모·주의사항)는
--   전부 본문(overview_html) 한 칸이 받는다 — 서술을 칸으로 쪼개면 대부분의 행에서 비고,
--   빈 칸이 많은 표는 무엇을 적어야 하는 자리인지 스스로 답하지 못한다.
--
-- 가용자금이 텍스트가 아니라 numeric인 것이 요점이다. '500억 내외' 같은 문자열로 두면
--   정렬도 범위 검색도 성립하지 않아, 원장이 아니라 메모가 된다. 폭이 필요한 표현
--   (범위·조건부)은 본문이 받는다. 저장 단위는 원이고 화면 표기는 백만원이다
--   (StartupGrowthSection과 같은 규칙 — 단위는 값이 아니라 머리글이 답한다).
--
-- 분야는 새 태그 원장을 만들지 않고 기존 industry_tags의 이름 배열을 담는다
--   (startups.industries와 같은 모양) — 같은 분류축을 두 원장으로 두면 한쪽만 늘어난다.
--
-- 변동 이력 트리거(app.log_entity_contribution)는 지금 붙이지 않는다. 붙이려면
--   entity_contributions의 SELECT/INSERT 정책이 'networks'만 예외로 두고 있는
--   비(非)사업 분기를 함께 넓혀야 하는데(그러지 않으면 app.entity_key_workspace의 else절에
--   걸려 이 원장의 이력이 NETWORKS 권한으로 판정된다), 그것은 이 원장이 필요로 하는 것보다
--   넓은 변경이다. 여기서 '누가·언제'는 created_by와 updated_at이 답한다.
--
-- 보안 게이트(11_migration_security_gate.md) 점검:
--   - 소유 워크스페이스: mna / 데이터 등급: Internal(외부 기업의 인수 의향 — 내부 한정)
--   - 접근 주체: 내부 사용자만. 게스트는 mna 워크스페이스 권한을 갖지 않으므로
--     can_read_workspace('mna')에서 그대로 막힌다.
--   - Scope: workspace 단위(딜에 매이지 않는 원장이라 program 스코프를 쓰지 않는다).
--   - RLS 즉시 활성화, SELECT/INSERT/UPDATE 정책 분리, DELETE 정책 없음(soft delete).
--   - 권한 판정은 app.can_read_workspace()/app.can_write_workspace() 헬퍼 경유.
--   - 새 RPC·SECURITY DEFINER 함수·Storage 정책 없음. 개인정보 원본 조회·다운로드·Export
--     경로가 없어 audit_logs/access_logs 적재 대상 행위가 없다.
--   - 운영 모듈(program_module_id)에 딸린 원장이 아니므로 app.module_external_record() 분류 대상 아님.
-- 근거: docs/docs_planning/3_6_workspace_ma.md
-- =====================================================================

create table if not exists public.ma_buyers (
  id              uuid primary key default gen_random_uuid(),
  -- 기업명. 원장의 식별자라 잘리면 곤란한 값이고, 목록에서 남는 폭을 받는 열이다.
  name            text not null,
  -- 분야(industry_tags의 이름 배열, 최대 3). 목록을 좁히는 첫 축이다.
  industries      jsonb not null default '[]'::jsonb,
  -- 희망사항 한 줄(예: '제조 분야 경영권 인수'). 자세한 조건은 본문이 받는다.
  wish            text,
  -- 가용자금(원 단위 저장, 화면 표기는 백만원). 목록 정렬 축이다.
  available_funds numeric,
  -- 상세내용. 이 원장의 몸통이며 tiptap이 만든 HTML을 그대로 담는다.
  overview_html   text,
  created_by      uuid references public.users(id) default app.current_app_user_id(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint ma_buyers_industries_array_chk check (jsonb_typeof(industries) = 'array'),
  -- 음수 자금은 값이 아니라 오타다. 0은 '가용자금 없음'으로 뜻이 있어 허용한다.
  constraint ma_buyers_available_funds_chk check (available_funds is null or available_funds >= 0)
);

comment on table public.ma_buyers is
  'M&A BUYER 원장 — 인수 희망 주체. 칸은 목록을 좁히거나 정렬하는 값만 두고 나머지 서술은 overview_html이 받는다.';
comment on column public.ma_buyers.industries is
  '분야(industry_tags 이름 배열, 최대 3). startups.industries와 같은 모양이라 태그 원장을 공유한다.';
comment on column public.ma_buyers.available_funds is
  '가용자금(원 단위). 화면 표기는 백만원 — 단위는 값이 아니라 표 머리글이 답한다.';
comment on column public.ma_buyers.overview_html is
  '상세내용(리치텍스트 HTML). 인수 배경·희망 조건·미팅 메모 등 목록을 좁히지 않는 서술 전부.';

-- 목록 쿼리 모양(soft delete 거르고 · 이름 부분일치 · 최신 수정순 30건)에 맞춘 부분 인덱스.
-- 조건이 인덱스에 들어가 있어야 플래너가 쓴다 — 화면이 조건을 바꾸면 여기도 함께 고친다
-- (규약: 20260731220000_list_search_sort_indexes.sql).
create extension if not exists pg_trgm with schema extensions;

-- gin_trgm_ops가 실제로 설치된 스키마를 카탈로그에서 찾아 붙인다(규약: 20260731220000).
-- pg_trgm이 이전에 다른 스키마에 깔려 있었다면 `with schema`가 옮겨 주지 않으므로,
-- 스키마명을 고정해 쓰면 "연산자 클래스 없음"으로 실패한다.
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
    'create index if not exists idx_ma_buyers_name_trgm on public.ma_buyers using gin (name %s) where deleted_at is null',
    trgm_ops
  );
  execute format(
    'create index if not exists idx_ma_buyers_wish_trgm on public.ma_buyers using gin (wish %s) where deleted_at is null',
    trgm_ops
  );
end $$;

create index if not exists idx_ma_buyers_updated_at
  on public.ma_buyers (updated_at desc)
  where deleted_at is null;

drop trigger if exists trg_ma_buyers_updated_at on public.ma_buyers;
create trigger trg_ma_buyers_updated_at
  before update on public.ma_buyers
  for each row execute function app.set_updated_at();

-- RLS — 즉시 활성화 + SELECT/INSERT/UPDATE 분리, DELETE 정책 없음(soft delete).
--
-- 딜 접근(can_access_ws_program)을 걸지 않는다. 이 원장은 딜에 매달린 것이 아니라 딜보다
-- 먼저 쌓이는 것이라, 딜 담당이 아니면 바이어를 못 보는 규칙은 원장을 쌓지 못하게 만든다.
-- 판정은 워크스페이스 읽기/쓰기 한 겹이며 NETWORKS와 같은 영구 공동관리다 — 담당자 원장을
-- 두지 않았으므로 mna 쓰기 권한자 전원이 관리 주체다.
alter table public.ma_buyers enable row level security;

drop policy if exists ma_buyers_select on public.ma_buyers;
create policy ma_buyers_select on public.ma_buyers for select
  using (app.can_read_workspace('mna'));

drop policy if exists ma_buyers_insert on public.ma_buyers;
create policy ma_buyers_insert on public.ma_buyers for insert
  with check (app.can_write_workspace('mna'));

drop policy if exists ma_buyers_update on public.ma_buyers;
create policy ma_buyers_update on public.ma_buyers for update
  using (app.can_write_workspace('mna'))
  with check (app.can_write_workspace('mna'));
