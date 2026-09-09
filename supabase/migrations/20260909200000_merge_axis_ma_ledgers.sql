-- =====================================================================
-- 중복 병합 축을 M&A 두 원장에 세우고, 병합 감사가 제 워크스페이스를 말하게 한다
--
-- 왜
--   중복 예방을 원장 전체로 넓혔지만(20260909190000 + 프론트) **이미 들어간 중복을 합칠
--   방법**은 NETWORKS와 STARTUP에만 있었다. 두 원장은 `merged_into_id`를 초기 스키마부터
--   갖고 있어 `public.merge_entity()`가 그대로 도는데, M&A 두 원장에는 그 칸이 없어
--   `merge_entity('ma_sellers', ...)`가 컬럼 없음으로 죽는다.
--
--   `merge_entity`는 원장을 가리지 않는 범용 RPC다(허용 목록이 아니라
--   `app.has_contribution_trigger()`가 카탈로그에서 판정한다). 두 원장 모두 기여 로그
--   트리거를 갖고 있으므로, **여기서 필요한 것은 컬럼 하나와 감사 트리거뿐**이다.
--
-- 감사 트리거의 오기
--   `app.audit_networks_merge()`는 action을 `NETWORKS_MERGE`로, 워크스페이스를 `networks`로
--   **박아** 두었다. NETWORKS 9종만 병합하던 시절의 값인데, 같은 트리거가 `startups`에도
--   붙어 있어 **스타트업 병합이 NETWORKS 기록으로 남고 있었다**(startups는 2026-07-31부터
--   `startup` 워크스페이스다). M&A까지 붙이면 그 오기가 셋으로 늘어난다.
--
--   그래서 워크스페이스를 트리거 인자로 받는다. 감사 로그는 '그때의 사실'이라 **이미 쌓인
--   행은 고치지 않는다** — 사후에 이름을 바꾸면 거짓 기록이 된다(2026-09-09 PROJECT 개명에서
--   `audit_logs.changed_workspace`를 손대지 않은 것과 같은 판단). 앞으로 쌓이는 것만 바로잡는다.
--
-- 참조 재배선은 여기서 하지 않는다
--   병합이 중복 행에 붙어 있던 자료·명단·연결을 정본으로 옮기는 일은 다음 마이그레이션이
--   맡는다. 축을 세우는 일과 옮기는 일을 한 파일에 섞으면, 옮기는 규칙을 고칠 때마다 축까지
--   다시 읽어야 한다.
--
-- 보안 게이트 사전 답변(11_migration_security_gate.md §2):
--   · 소유 워크스페이스: mna(원장 둘) · 감사 트리거는 startups(startup)·networks도 함께 고친다
--   · 데이터 등급: Internal (컬럼 하나는 같은 원장 안의 행을 가리키는 참조다)
--   · 접근 주체: 내부 사용자만. 게스트는 두 원장에 어떤 권한도 없다
--   · Scope 기준: global(원장 단위). 병합 실행 자격은 RPC를 부르는 화면이 정한다
--   · 감사 로그: **병합은 감사 대상**이고 이 파일이 그 적재 경로를 두 원장에 붙인다
--     (`audit_logs`에 직접 INSERT는 RLS로 막혀 있어 SECURITY DEFINER 트리거가 넣는다)
--   · 운영 영향: 컬럼 추가는 nullable이라 기존 행·정책·조회에 영향이 없다. 목록이 병합 행을
--     거르는 일은 프론트가 맡으며 같은 라운드에서 함께 나간다
--
-- 필수 SQL 체크리스트:
--   · 신규 테이블 없음 / DELETE 정책 없음 / 신규 RPC 없음
--   · SECURITY DEFINER 트리거 함수는 `set search_path = app, public` 고정
--   · 정책 변경 없음(컬럼 추가는 기존 SELECT·INSERT·UPDATE 정책이 그대로 덮는다)
--   · 멱등(add column if not exists / create or replace / drop trigger if exists)
--
-- 근거: 20260705120400(startups.merged_into_id), 20260705140000(병합 감사 트리거),
--       20260722140000(merge_entity), 20260907120000·20260907160000(M&A 원장)
-- =====================================================================

-- ── (1) M&A 두 원장에 병합 축 ────────────────────────────────────────
alter table public.ma_sellers
  add column if not exists merged_into_id uuid references public.ma_sellers(id);
alter table public.ma_buyers
  add column if not exists merged_into_id uuid references public.ma_buyers(id);

comment on column public.ma_sellers.merged_into_id is
  '중복 병합 대상(정본) id. 값이 차면 이 행은 목록에서 빠지고 정본이 대신 선다. 물리 삭제가 아니라 표시이므로 되짚을 수 있다.';
comment on column public.ma_buyers.merged_into_id is
  '중복 병합 대상(정본) id. 값이 차면 이 행은 목록에서 빠지고 정본이 대신 선다. 물리 삭제가 아니라 표시이므로 되짚을 수 있다.';

-- 목록·대조가 늘 함께 거르는 축이라 부분 인덱스로 살아 있는 행만 훑는다.
create index if not exists idx_ma_sellers_live
  on public.ma_sellers (name) where deleted_at is null and merged_into_id is null;
create index if not exists idx_ma_buyers_live
  on public.ma_buyers (name) where deleted_at is null and merged_into_id is null;

-- ── (2) 병합 감사 — 워크스페이스를 인자로 받는다 ──────────────────────
-- 종전 이름(`audit_networks_merge`)을 그대로 두고 인자만 받게 한다. 이름을 바꾸면 이미
-- 붙어 있는 트리거 정의를 전부 다시 만들어야 하고, 하나라도 빠뜨리면 그 원장의 병합만
-- 조용히 기록되지 않는다 — 감사 경로가 조용히 끊기는 것이 가장 나쁜 실패다.
create or replace function app.audit_networks_merge()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  -- 인자를 주지 않은 옛 트리거 정의는 종전대로 동작한다(이 파일이 전부 다시 붙이지만,
  -- 다른 마이그레이션이 인자 없이 붙여 두었을 수 있다).
  v_ws text := coalesce(tg_argv[0], 'networks');
begin
  if tg_op = 'UPDATE'
     and new.merged_into_id is distinct from old.merged_into_id
     and new.merged_into_id is not null then
    insert into public.audit_logs (
      actor_user_id, action, changed_workspace, before_data, after_data, reason
    )
    values (
      app.current_app_user_id(),
      -- action은 원장이 아니라 **행위**를 부른다. 워크스페이스는 옆 칸이 답하므로
      -- 이름에 두 번 적지 않는다(종전 `NETWORKS_MERGE`는 그 둘을 붙여 놓은 값이었다).
      'ENTITY_MERGE',
      v_ws,
      jsonb_build_object('table', tg_table_name, 'id', new.id),
      jsonb_build_object('merged_into_id', new.merged_into_id),
      nullif(current_setting('app.audit_reason', true), '')
    );
  end if;
  return new;
end;
$$;

comment on function app.audit_networks_merge() is
  '중복 병합(merged_into_id 설정)을 audit_logs에 적재한다. 워크스페이스는 트리거 인자(tg_argv[0])가 정한다 — 한 함수가 원장 넷에 붙으므로 함수 안에 박으면 그 값이 반드시 어느 원장에서 틀린다. 이미 쌓인 행은 고치지 않는다(감사 로그는 그때의 사실이다).';

-- 원장마다 자기 워크스페이스를 인자로 준다.
drop trigger if exists trg_startups_merge_audit on public.startups;
create trigger trg_startups_merge_audit
  after update of merged_into_id on public.startups
  for each row execute function app.audit_networks_merge('startup');

drop trigger if exists trg_networks_merge_audit on public.networks;
create trigger trg_networks_merge_audit
  after update of merged_into_id on public.networks
  for each row execute function app.audit_networks_merge('networks');

drop trigger if exists trg_ma_sellers_merge_audit on public.ma_sellers;
create trigger trg_ma_sellers_merge_audit
  after update of merged_into_id on public.ma_sellers
  for each row execute function app.audit_networks_merge('mna');

drop trigger if exists trg_ma_buyers_merge_audit on public.ma_buyers;
create trigger trg_ma_buyers_merge_audit
  after update of merged_into_id on public.ma_buyers
  for each row execute function app.audit_networks_merge('mna');
