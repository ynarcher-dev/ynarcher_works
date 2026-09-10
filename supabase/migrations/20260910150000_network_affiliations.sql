-- =====================================================================
-- 사람은 네트워크 원장 한 줄이고, 소속은 관계 줄이 답한다
--
-- 무엇을 여는가
--   (1) NETWORKS 구분에 `startup`을 더한다 — 스타트업의 대표자·핵심인력이 사는 자리다.
--   (2) `public.network_affiliations` — 사람↔조직 + 직함 + 기간의 관계 줄.
--   (3) `public.startups.representative_network_id` — 대표자를 글자가 아니라 사람으로 가리킨다.
--   (4) 스타트업 원장이 바뀌면 그 기업의 관계 줄을 맞추는 트리거.
--
-- 왜 관계 줄인가 (2026-09-10 사용자 확정 — B안)
--   회의록의 '외부 참석자'가 누구인가에서 시작했다. 참석자는 스타트업 대표일 수도, CTO일
--   수도, 전문가일 수도, 바이어일 수도 있는데 **그 전부가 사람**이고 사람이 사는 원장은
--   NETWORKS 하나다. 그러면 남는 물음은 하나 — *그 사람이 어느 조직 소속인가*.
--
--   지금 그 답은 `networks.affiliation` 글자 한 칸이고, 그 칸으로는 셋을 말하지 못한다.
--     · **겸직**: 실제 명함첩에 kt ds / 국민대, 고려대 / 제론메드가 있다. 한 칸에 둘을
--       슬래시로 적으면 그 문자열은 어느 조직도 가리키지 못한다.
--     · **이력**: 대표가 바뀌면 전임자에게 "전 스타트업A 대표"가 남아야 하는데, 칸을
--       덮어쓰면 그 사실이 사라진다.
--     · **그때 소속**: 2년 전 회의록의 참석자는 그때의 소속으로 읽혀야 한다.
--   기간을 가진 줄이 그 셋을 한 번에 답한다.
--
-- 왜 `profile.affiliation_history`로 충분하지 않은가
--   그 배열(20260722140000)은 **소속 칸이 언제 무엇에서 무엇으로 바뀌었는가**의 감사 기록이고
--   트리거가 소유한다(사람이 고치지 않는다). 담는 것이 글자 세 개(소속·부서·직책)라 조직
--   원장 행을 가리키지 못하고, 한 시점에 소속이 하나뿐임을 전제한다. 그래서 **걷지 않고
--   그대로 둔다** — 축이 다르다. 이 줄이 답하는 것은 '지금 어디에 속했는가'이고 저 배열이
--   답하는 것은 '이 칸이 어떻게 고쳐졌는가'다.
--
-- 왜 대표자는 한 명인가 (2026-09-10 사용자 확정)
--   공동대표·각자대표는 실재하지만 **게스트 계정이 원장 행 하나에 하나**라(3_9_1) 대표가
--   둘이면 어느 이메일이 로그인 ID인지 원장이 답하지 못한다. 그래서 대표자 칸은 **회사의
--   창구 한 사람**으로 좁히고, 공동대표는 직함이 '공동대표'인 핵심인력 한 줄로 선다.
--   잃는 것이 없다 — 관계 줄에서 대표자도 핵심인력도 똑같이 사람↔조직 한 줄이고, 차이는
--   계정 명의로 서느냐뿐이다.
--
-- 왜 글자 칸을 지우지 않는가
--   `startups.representative`(글자)와 `networks.affiliation`(글자)을 그대로 둔다. 원장에는
--   연결할 사람이 아직 없는 행이 있고, 대량 업로드로 들어오는 명함은 소속이 처음부터
--   글자다. 그래서 이 자리는 **세 상태**다 — 연결됨 / 글자만(미연결) / 비어 있음. 글자를
--   지우면 미연결 상태를 표현할 수단이 사라져 "적을 수는 있는데 저장하면 사라지는 칸"이 된다.
--
-- 보안 게이트(11_migration_security_gate.md)
--   · 소유 워크스페이스: networks(관계 줄) · startup(대표자 참조 컬럼)
--   · 데이터 등급: Personal — 사람의 소속·직함·재직기간이다(연락처는 담지 않는다).
--   · 접근 주체: 내부 사용자만. 게스트는 두 원장 어느 쪽도 읽지 못한다.
--   · Scope: 워크스페이스 단위(네트워크 원장은 담당자 축이 없는 영구 공동관리).
--   · 감사 로그: 원장 본체가 아니라 그 사이의 줄이라 access_logs 대상이 아니다. 변동은
--     기여 로그 트리거가 사람 원장(networks) 쪽에 남기던 것을 그대로 쓴다(이 표에는 붙이지
--     않는다 — 기여 로그는 원장 행 단위의 축이고 이 줄은 그 행에 딸린 값이다).
--   · RLS: 표 생성 즉시 켜고 SELECT/INSERT/UPDATE 정책을 분리했다. DELETE 정책은 만들지
--     않는다(물리 삭제 금지 — 오등록은 deleted_at). 정책은 auth.jwt()를 파싱하지 않고
--     app.can_read_workspace / app.is_internal_user 헬퍼를 경유한다.
--   · SECURITY DEFINER 함수 없음. 트리거 셋 다 INVOKER라 관계 줄 쓰기에도 이 표의 RLS가
--     그대로 걸린다 — DEFINER로 두면 스타트업 원장을 고칠 수 있는 사람이 네트워크 원장의
--     정책을 통째로 건너뛰고 줄을 만들게 된다.
--   · 운영 영향: 기존 화면은 아무것도 바뀌지 않는다. 새 컬럼은 nullable이고 새 표는 비어
--     있으며, 트리거는 참조 값이 비어 있으면 아무 줄도 만들지 않는다.
--
-- 근거: docs/docs_planning/3_3_4_networks_unified_ledger.md,
--       20260904120000(통합 원장), 20260909190000(두 원장 쓰기 = 내부 사용자 전원),
--       20260722140000(소속 이력 배열), 20260710150000(team_profile)
-- =====================================================================

-- ── 1. NETWORKS 구분에 스타트업을 더한다 ──────────────────────────────
-- 값이 코드이고 라벨은 화면이 갖는다(CATEGORY_LABEL). 여기서는 CHECK만 넓힌다.
alter table public.networks drop constraint if exists networks_category_chk;
alter table public.networks
  add constraint networks_category_chk check (
    category is null or category in (
      'experts', 'van', 'exp', 'investors', 'startup',
      'corporates', 'institutions', 'universities', 'etc', 'vendors'
    )
  );

comment on column public.networks.category is
  '구분 코드(experts|van|exp|investors|startup|corporates|institutions|universities|etc|vendors). null = 미분류. startup은 스타트업의 대표자·핵심인력이며 조직이 아니라 사람이다. 라벨은 화면 상수가 소유한다.';

-- ── 2. 관계 줄 ────────────────────────────────────────────────────────
create table if not exists public.network_affiliations (
  id           uuid primary key default gen_random_uuid(),
  -- 사람. 네트워크 원장 행 하나를 가리킨다.
  network_id   uuid not null references public.networks(id) on delete cascade,
  -- 조직 축. 원장 행을 가리키거나(연결됨) 이름만 있거나(미연결) 둘 중 하나다.
  --
  -- 다형 키에 FK를 걸지 않는 것은 이 앱의 관례 그대로다(entity_contributions·attachments).
  -- 지금 이어지는 원장은 스타트업 하나이고, 넓히는 것은 아래 CHECK 한 줄과 실재 확인
  -- 트리거의 분기 하나다 — **방향을 행에 적지 않는다**(attachment_ref_sources와 같은 판단:
  -- 행에 적으면 한 건씩 어긋날 수 있고 새 방향을 열 때 기존 행을 전부 고쳐야 한다).
  org_type     text not null,
  org_id       uuid,
  -- 미연결일 때만 채운다. 연결된 조직의 이름은 그 원장이 답한다 — 여기 옮겨 적으면
  -- 조직이 개명한 날 이 줄만 옛 이름으로 남는다.
  org_name     text,
  -- 직함. 코드가 아니라 명함에 적힌 말 그대로다(대표 / 공동대표 / CTO / 사외이사).
  -- 라벨 표를 두지 않는 이유는 주소 구분(20260910120000)과 같다 — 표를 하나 더 두면
  -- 이 줄을 눈으로 읽을 때마다 그 표를 함께 열어야 한다.
  title        text,
  started_on   date,
  -- 비어 있으면 **현재 소속**이다. 여럿이 비어 있으면 겸직이고, 그것이 이 표를 만든 이유다.
  ended_on     date,
  -- 이 줄을 무엇이 만들었는가(manual | startup_form | bulk_upload). 사람이 주장한 것과
  -- 다른 원장에서 파생된 것을 가르는 축이며, 파생된 줄은 원본이 바뀌면 따라 바뀐다.
  source       text not null default 'manual',
  created_by   uuid references public.users(id) default app.current_app_user_id(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- 오등록 정리용. 관계 줄은 **사실의 주장**이지 담당자가 만든 그릇이 아니라, 하드 딜리트의
  -- 두 예외(모듈 인스턴스·게스트 명부 행)에 해당하지 않는다.
  deleted_at   timestamptz,
  constraint network_affiliations_org_type_chk check (org_type in ('startup', 'text')),
  constraint network_affiliations_org_chk check (
    (org_type = 'startup' and org_id is not null and org_name is null)
    or (org_type = 'text' and org_id is null and nullif(btrim(org_name), '') is not null)
  ),
  constraint network_affiliations_period_chk check (
    ended_on is null or started_on is null or ended_on >= started_on
  )
);

comment on table public.network_affiliations is
  '사람↔조직 관계 줄(NETWORKS). 한 사람이 여러 조직에 기간을 갖고 속한다 — 겸직·이력·그때 소속을 이 표 하나가 답한다. networks.affiliation 글자 칸은 관계 줄이 없는 행의 표시값으로 남는다.';
comment on column public.network_affiliations.org_type is
  '조직 축의 종류(startup=스타트업 원장 행 / text=이름만 아는 미연결). 넓히는 것은 이 CHECK와 app.enforce_network_affiliation_org()의 분기 하나다.';
comment on column public.network_affiliations.ended_on is
  '종료일. null이면 현재 소속이며 여럿이 null이면 겸직이다. 대표가 바뀌면 전임자의 줄에 이 값이 찍혀 "전 OO 대표"가 남는다 — 지우지 않는 이유는 그것이 사실이기 때문이다.';
comment on column public.network_affiliations.source is
  '이 줄을 만든 경로(manual | startup_form | bulk_upload). startup_form 줄은 스타트업 원장이 소유하므로 그쪽이 바뀌면 트리거가 따라 고친다.';

-- ── 3. 인덱스 ─────────────────────────────────────────────────────────
-- 사람 상세가 내는 모양(그 사람의 줄 전부, 현재가 먼저).
create index if not exists idx_network_affiliations_network
  on public.network_affiliations (network_id) where deleted_at is null;
-- 조직 상세가 내는 모양(그 조직의 사람들).
create index if not exists idx_network_affiliations_org
  on public.network_affiliations (org_type, org_id) where deleted_at is null and org_id is not null;

-- 한 사람이 한 조직에 **열린 줄 하나**. 없으면 저장을 두 번 누른 만큼 줄이 는다.
-- 종료된 줄은 제약 밖이다 — 나갔다 돌아온 사람은 두 줄이 사실이다.
create unique index if not exists uq_network_affiliations_open
  on public.network_affiliations (network_id, org_type, org_id)
  where deleted_at is null and ended_on is null and org_id is not null;

-- ── 4. RLS ────────────────────────────────────────────────────────────
alter table public.network_affiliations enable row level security;

-- 읽기는 사람 원장과 같은 판정이다. 이 줄이 말하는 것은 그 원장 행이 이미 말하는 사실이라
-- 여기만 따로 넓히거나 좁히면 두 화면이 같은 물음에 다른 답을 낸다.
drop policy if exists network_affiliations_select on public.network_affiliations;
create policy network_affiliations_select on public.network_affiliations for select
  using (app.can_read_workspace('networks'));

-- 쓰기는 네트워크 원장 쓰기와 같다(2026-09-09에 내부 사용자 전원으로 열렸다).
drop policy if exists network_affiliations_insert on public.network_affiliations;
create policy network_affiliations_insert on public.network_affiliations for insert
  with check (app.is_internal_user());

drop policy if exists network_affiliations_update on public.network_affiliations;
create policy network_affiliations_update on public.network_affiliations for update
  using (app.is_internal_user())
  with check (app.is_internal_user());

-- DELETE 정책은 만들지 않는다 = 전면 거부. 오등록은 deleted_at으로 내린다.

comment on policy network_affiliations_select on public.network_affiliations is
  '네트워크 원장을 읽을 수 있으면 그 사람의 관계 줄도 읽는다 — 이 줄은 원장 행이 이미 말하는 사실의 구조화된 형태다.';
comment on policy network_affiliations_insert on public.network_affiliations is
  '내부 사용자 전원이 관계 줄을 만든다(networks_insert와 한 벌). 스타트업 폼에서 사람을 이으면 트리거가 이 정책을 그대로 통과해 줄을 만든다.';

-- ── 5. 조직 실재 확인 ─────────────────────────────────────────────────
-- 다형 키에 FK를 걸 수 없으므로 삽입·수정 시 그 조직의 실재를 확인한다
-- (app.enforce_program_ref와 같은 자리). INVOKER라 호출자의 RLS가 그대로 걸린다 —
-- 읽지 못하는 원장의 행을 가리키는 줄은 만들 수 없다.
create or replace function app.enforce_network_affiliation_org()
returns trigger
language plpgsql
security invoker
set search_path = app, public
as $$
begin
  if NEW.org_type = 'startup' then
    if not exists (
      select 1 from public.startups s where s.id = NEW.org_id and s.deleted_at is null
    ) then
      raise exception '연결하려는 기업을 찾을 수 없습니다.' using errcode = '23503';
    end if;
  end if;
  return NEW;
end $$;

comment on function app.enforce_network_affiliation_org() is
  '관계 줄이 가리키는 조직이 실재하는지 확인한다(다형 키라 FK를 걸 수 없다). org_type을 넓힐 때 분기를 함께 더한다 — 빠뜨리면 없는 조직을 가리키는 줄이 조용히 들어온다.';

drop trigger if exists trg_network_affiliations_org on public.network_affiliations;
create trigger trg_network_affiliations_org
  before insert or update on public.network_affiliations
  for each row execute function app.enforce_network_affiliation_org();

drop trigger if exists trg_network_affiliations_updated_at on public.network_affiliations;
create trigger trg_network_affiliations_updated_at
  before update on public.network_affiliations
  for each row execute function app.set_updated_at();

-- ── 6. 스타트업 대표자를 사람으로 가리킨다 ────────────────────────────
alter table public.startups
  add column if not exists representative_network_id uuid references public.networks(id);

create index if not exists idx_startups_representative_network
  on public.startups (representative_network_id) where representative_network_id is not null;

comment on column public.startups.representative_network_id is
  '대표자(네트워크 원장 행). **한 명뿐이다** — 공동대표·각자대표는 직함이 그것인 핵심인력으로 선다(게스트 계정이 원장 행 하나에 하나라 대표가 둘이면 로그인 ID를 원장이 답하지 못한다). null이면 미연결이며 그때는 representative 글자 칸이 표시값이다.';
comment on column public.startups.representative is
  '대표자 이름(글자). 사람 원장에 연결하기 전의 표시값이며 representative_network_id가 있으면 그쪽이 이긴다 — 지우지 않는 이유는 연결할 사람이 아직 없는 행이 있어서다.';

-- ── 7. 스타트업이 말하는 사람을 관계 줄로 옮긴다 ──────────────────────
-- 대표자와 핵심인력(team_profile.members[].networkId)을 읽어 그 기업의 관계 줄을 맞춘다.
--
-- **없어진 사람은 지우지 않고 끝낸다**(ended_on = 오늘) — 그것이 "전 스타트업A 대표"다.
-- 잘못 이은 줄까지 이력으로 남는 것이 이 선택의 대가이며, 그 정리는 사람이 관계 줄을
-- 내리는 것으로 한다(트리거는 오등록과 퇴임을 가릴 근거가 없다).
create or replace function app.sync_startup_affiliations()
returns trigger
language plpgsql
security invoker
set search_path = app, public
as $$
begin
  -- 사람 참조도 team_profile도 그대로면 할 일이 없다. 스타트업 저장은 잦고 그 대부분은
  -- 이 두 값과 무관하다.
  if TG_OP = 'UPDATE'
     and OLD.representative_network_id is not distinct from NEW.representative_network_id
     and OLD.team_profile is not distinct from NEW.team_profile
     and OLD.deleted_at is not distinct from NEW.deleted_at then
    return NEW;
  end if;

  -- 세 가지 손질(끝내기·직함 고치기·열기)을 **한 문장**으로 한다. 임시 테이블을 쓰지 않는
  -- 것은 트리거가 행마다 도는 자리이기 때문이다 — 한 번의 저장이 여러 행을 건드리면
  -- 그 표를 만들고 비우는 일이 행 수만큼 일어난다.
  --
  -- 한 문장 안의 CTE는 같은 스냅샷을 보므로 서로의 결과를 보지 못한다. 여기서는 그것이
  -- 맞다 — 끝낸 줄은 '지금 말하지 않는 사람'이라 아래 insert의 대상(wanted)에 애초에 없고,
  -- 직함을 고친 줄은 insert의 not exists에 열린 줄로 잡혀 다시 만들어지지 않는다.
  with wanted as (
    -- prio를 바깥 select에 함께 세우고 한 겹 더 감싼다 — DISTINCT ON에서는 ORDER BY에
    -- 쓰는 값이 select 목록에 있어야 한다(없으면 실행 시점에 죽는다).
    select network_id, title from (
    select distinct on (network_id) network_id, title, prio
      from (
        select NEW.representative_network_id as network_id, '대표'::text as title, 0 as prio
         where NEW.deleted_at is null and NEW.representative_network_id is not null
        union all
        select member_id, member_title, 1
          from (
            -- 캐스팅은 CASE 안에서만 한다. 걸러 낸 뒤에 캐스팅하도록 두면 플래너가
            -- 순서를 바꿀 수 있어, 사람이 아닌 값이 한 줄만 섞여도 저장 전체가 죽는다.
            select case
                     when lower(coalesce(m ->> 'networkId', '')) ~
                          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       then (m ->> 'networkId')::uuid
                   end as member_id,
                   nullif(btrim(coalesce(m ->> 'role', '')), '') as member_title
              from jsonb_array_elements(coalesce(NEW.team_profile -> 'members', '[]'::jsonb)) m
             where NEW.deleted_at is null
          ) mm
         where member_id is not null
      ) t
     order by network_id, prio
    ) d
  ),
  -- ① 더 이상 말하지 않는 사람의 열린 줄을 끝낸다. 손으로 만든 줄(source='manual')은
  --    건드리지 않는다 — 스타트업 폼이 소유하지 않는 사실이다.
  closed as (
    update public.network_affiliations a
       set ended_on = current_date
     where a.org_type = 'startup'
       and a.org_id = NEW.id
       and a.source = 'startup_form'
       and a.deleted_at is null
       and a.ended_on is null
       and not exists (select 1 from wanted w where w.network_id = a.network_id)
    returning a.id
  ),
  -- ② 직함이 바뀌었으면 따라 고친다(대표 → 사외이사처럼 자리가 바뀌는 경우).
  retitled as (
    update public.network_affiliations a
       set title = w.title
      from wanted w
     where a.org_type = 'startup'
       and a.org_id = NEW.id
       and a.network_id = w.network_id
       and a.source = 'startup_form'
       and a.deleted_at is null
       and a.ended_on is null
       and a.title is distinct from w.title
    returning a.id
  )
  -- ③ 새로 말하기 시작한 사람의 줄을 연다. 종료된 줄이 있어도 새로 여는 것이 맞다 —
  --    나갔다 돌아온 사람은 두 줄이 사실이다(유일 인덱스도 열린 줄에만 걸린다).
  insert into public.network_affiliations (network_id, org_type, org_id, title, started_on, source)
  select w.network_id, 'startup', NEW.id, w.title, current_date, 'startup_form'
    from wanted w
   where not exists (
     select 1 from public.network_affiliations a
      where a.org_type = 'startup'
        and a.org_id = NEW.id
        and a.network_id = w.network_id
        and a.deleted_at is null
        and a.ended_on is null
   );

  return NEW;
end $$;

comment on function app.sync_startup_affiliations() is
  '스타트업이 말하는 사람(대표자 1 + 핵심인력)을 관계 줄로 옮긴다. 없어진 사람은 지우지 않고 ended_on을 찍어 "전 OO 대표"를 남기며, 손으로 만든 줄(source=manual)은 건드리지 않는다. INVOKER라 network_affiliations의 RLS가 그대로 걸린다.';

drop trigger if exists trg_startups_sync_affiliations on public.startups;
create trigger trg_startups_sync_affiliations
  after insert or update on public.startups
  for each row execute function app.sync_startup_affiliations();
