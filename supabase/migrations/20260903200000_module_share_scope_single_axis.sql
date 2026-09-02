-- =====================================================================
-- 공유 범위를 한 축 세 값으로 되합친다 (2/2) — 성격은 ADMIN이 템플릿에 박는다
-- 선행: 20260903190000_module_visibility_public_link_value.sql (enum 값)
--
-- 무엇이 잘못돼 있었나
--   2026-09-02에 '공유 범위'(로그인한 사람 중 누가 보는가)와 '링크 공유'(바깥에 문을 여는가)를
--   독립한 두 축으로 갈랐다. 갈라 놓으니 담당자가 만질 스위치가 둘이 되었고, 이름만 봐서는
--   무엇을 만져야 밖에 열리는지 알 수 없었다 — **PUBLIC을 걷어내며 없앴던 오인(전체공개를
--   골랐는데 아무 일도 안 일어남)이 이름만 바꿔 되살아난 것**이다.
--
--   두 축이 독립이라 본 근거도 성립하지 않았다. 근거는 "모집을 여는 시점에는 명부가 비어
--   있으므로 INTERNAL_ONLY + 링크 켜짐이 정상 조합"이었으나, 게스트 앱에서 모집은 전용 화면이
--   없어 안내 한 줄만 뜨는 몸통 없는 메뉴다. 그 조합은 아무것도 여닫지 않는다.
--
-- 겹칠 수 없는 진짜 이유는 순서다
--   (1) 모집(PUBLIC_LINK, 신원을 모르는 사람에게서 받는다) → (2) 선발(WORKS) →
--   (3) 계정 발급(여기서 신원이 확정된다) → (4) 운영(GUEST). **게스트 계정은 모집의 결과물**이라
--   모집이 게스트에게 보이려면 자기 결과가 자기보다 먼저 있어야 한다 — 순서상 불가능하다.
--   구간이 바뀔 때 이동하는 것은 모듈이 아니라 사람이고, 담당자가 돌리는 것은 스위치가 아니라
--   계정 발급이다. 그래서 세 값은 배타이고, **값은 담당자가 고르지 않는다.**
--
-- 무엇을 바꾸나
--   (1) 인스턴스 CHECK를 세 값으로 넓힌다(폐기된 PUBLIC은 계속 막힌다).
--   (2) 템플릿의 공유 상한 2종(allow_guest·allow_public_link)을 **성격 한 축**
--       (module_templates.visibility)으로 합친다. 두 컬럼은 지우지 않고 이 축에서 파생되는
--       **생성 열(generated)** 로 되살린다 — 아래 '컬럼을 지우지 않는 이유' 참조.
--   (3) 판정 헬퍼를 새 축 위에 다시 세운다.
--   (4) 성격이 PUBLIC_LINK인 템플릿의 인스턴스 값을 그 값으로 맞춘다.
--   (5) 모듈 원장 트리거가 인스턴스 값이 템플릿 성격 안에 있는지 함께 본다.
--   (6) ADMIN 저장 RPC가 새 축을 받는다.
--
-- 컬럼을 지우지 않고 생성 열로 남기는 이유
--   allow_public_link를 읽는 곳이 DB 밖에도 있다 — 공개 링크 해석 Edge Function이다. 컬럼을
--   지우면 그 함수가 재배포되기 전까지 **바깥에 열린 문이 조용히 죽는다**(select 실패).
--   생성 열은 visibility에서 계산되어 어긋날 수 없으므로 '같은 사실을 두 곳에 적는' 것이
--   아니라 읽기 호환 껍데기이며, 쓰기는 불가능해 새 코드로 넘어가는 것을 강제한다.
--   함수 재배포가 끝나면 별도 마이그레이션으로 걷는다(PROGRESS 후속 항목).
--
-- 함께 바로잡는 것 두 가지
--   · **트리거의 워크스페이스 인자**: 20260903100000의 원장 통합으로 세 워크스페이스의 모듈이
--     한 표에 들어왔는데, trg_enforce_module_template은 'ac' 고정 인자를 계속 들고 있었다.
--     지금은 4종이 모두 세 워크스페이스에 열려 있어 드러나지 않지만, ADMIN이 M&A 노출만 끄면
--     트리거가 AC 기준으로 판정해 그대로 통과시킨다. 소속은 행의 entity_key가 답한다.
--   · **링크 상한에서 is_active를 뺀다**: 카탈로그(is_active)는 새로 배치하는 것만 막고 진행
--     중인 인스턴스를 멈추지 않는다는 것이 3_2_1 §6.5의 관통 규칙인데, module_public_linkable이
--     is_active를 함께 보고 있어 '사용'을 끄면 밖에 열린 문까지 닫혔다. 노출을 닫는 것은
--     카탈로그가 아니라 성격 축의 일이다.
--
-- 근거 기획: docs/docs_planning/3_4_15_ac_public_links.md 4·7.1(b)(c)절,
--            docs/docs_planning/3_2_1_admin_module_registry.md 4·6.4·6.5절
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 ws: 템플릿 원장=admin(쓰기)/내부 사용자(읽기), 모듈 원장=ac·mna·project(entity_key).
--     등급 Internal(배치 정보뿐, 개인정보 없음). Scope: global(카탈로그) · program→module(인스턴스).
--   · 접근 주체 변화 없음. **노출은 좁아지는 방향으로만 움직인다** — 모집 템플릿의 성격이
--     PUBLIC_LINK가 되면서 allows_guest가 false가 되어 게스트 메뉴에서 모집이 사라진다.
--     반영 전 조회로 대상 3건(모두 종료·취소된 사업)을 확인했다(3_4_15 14절 DoD 13).
--   · 신규 테이블·Storage·정책 없음. 신규 SECURITY DEFINER 없음 — 헬퍼 3종과 ADMIN 저장
--     RPC는 종전대로 SECURITY INVOKER이고, 재정의하는 DEFINER 함수도 없다
--     (app.guest_module_ids()는 손대지 않는다: 조건이 헬퍼 경유라 새 축이 그대로 반영된다).
--   · 트리거는 신설이 아니라 재정의다. 조건이 하나 늘어나는 방향(공유 범위 검증 추가)이다.
--   · GRANT EXECUTE는 authenticated 한정 유지. 감사 로그 대상 아님(개인정보·다운로드·Export·
--     권한 변경 아님). 물리 삭제 없음 — 지우는 것은 행이 아니라 파생 가능한 컬럼 2개이며
--     같은 이름의 생성 열로 즉시 되살린다.
-- 근거: 20260902140000_module_templates.sql, 20260902160000_public_link_manager_writes.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 인스턴스 CHECK — 세 값
-- ---------------------------------------------------------------------
alter table public.program_modules drop constraint if exists program_modules_visibility_check;
alter table public.program_modules
  add constraint program_modules_visibility_check
  check (visibility in ('INTERNAL_ONLY', 'GUEST_ONLY', 'PUBLIC_LINK'));

comment on column public.program_modules.visibility is
  '공유 범위(배타 3값). PUBLIC_LINK=주소를 아는 누구나 / GUEST_ONLY=내부+초대된 참여기업·전문가 /
   INTERNAL_ONLY=내부 운영자만. 어느 값을 쓸지는 담당자가 고르지 않고 module_templates.visibility가
   정한다 — 노출 범위는 그때그때의 선택이 아니라 모듈 종류의 성격이다.';

-- ---------------------------------------------------------------------
-- (2) 템플릿 성격 한 축
-- ---------------------------------------------------------------------
alter table public.module_templates
  add column if not exists visibility text not null default 'INTERNAL_ONLY';

-- 두 상한의 조합을 그대로 옮긴다. 링크가 켜져 있으면 그 종류는 바깥용이고(배타),
-- 아니면 게스트 상한이 그대로 상한이 된다.
update public.module_templates
   set visibility = case
                      when allow_public_link then 'PUBLIC_LINK'
                      when allow_guest       then 'GUEST_ONLY'
                      else 'INTERNAL_ONLY'
                    end;

alter table public.module_templates drop constraint if exists module_templates_visibility_check;
alter table public.module_templates
  add constraint module_templates_visibility_check
  check (visibility in ('PUBLIC_LINK', 'GUEST_ONLY', 'INTERNAL_ONLY'));

alter table public.module_templates drop column allow_guest;
alter table public.module_templates drop column allow_public_link;

alter table public.module_templates
  add column allow_guest boolean
    generated always as (visibility = 'GUEST_ONLY') stored;
alter table public.module_templates
  add column allow_public_link boolean
    generated always as (visibility = 'PUBLIC_LINK') stored;

comment on column public.module_templates.visibility is
  '이 종류가 쓰는 공유 범위(성격). PUBLIC_LINK면 인스턴스는 그 값 하나로 고정되고,
   GUEST_ONLY면 담당자가 GUEST_ONLY/INTERNAL_ONLY 중에서 고르며, INTERNAL_ONLY면 내부 전용이다.';
comment on column public.module_templates.allow_guest is
  '읽기 호환 껍데기(visibility에서 파생, 쓰기 불가). 새 코드는 visibility를 읽는다.';
comment on column public.module_templates.allow_public_link is
  '읽기 호환 껍데기(visibility에서 파생, 쓰기 불가). 새 코드는 visibility를 읽는다.';

-- ---------------------------------------------------------------------
-- (3) 판정 헬퍼 — 전부 SECURITY INVOKER
-- ---------------------------------------------------------------------

-- 이 템플릿에서 인스턴스가 가질 수 있는 공유 범위. 화면의 셀렉트와 서버의 강제가 같은 답을
-- 얻는 단일 원천이며, 카탈로그에 없는 키는 빈 배열이다(고를 수 있는 값이 없다).
create or replace function app.module_template_visibilities(p_key text)
returns text[]
language sql
stable
set search_path = app, public
as $$
  select coalesce(
    (select case t.visibility
              when 'PUBLIC_LINK' then array['PUBLIC_LINK']
              when 'GUEST_ONLY'  then array['GUEST_ONLY', 'INTERNAL_ONLY']
              else                    array['INTERNAL_ONLY']
            end
       from public.module_templates t
      where t.key = p_key),
    '{}'::text[]);
$$;

create or replace function app.module_template_allows_guest(p_key text)
returns boolean
language sql
stable
set search_path = app, public
as $$
  select exists (
    select 1 from public.module_templates t
     where t.key = p_key and t.visibility = 'GUEST_ONLY'
  );
$$;

-- is_active를 보지 않는다 — 카탈로그를 끄는 것은 "앞으로 이 종류는 새로 배치하지 않는다"이지
-- "지금 열려 있는 문을 닫는다"가 아니다(3_2_1 6.5절). 문을 닫는 것은 성격 축의 일이다.
create or replace function app.module_public_linkable(p_module_type text)
returns boolean
language sql
stable
set search_path = app, public
as $$
  select exists (
    select 1 from public.module_templates t
     where t.key = p_module_type and t.visibility = 'PUBLIC_LINK'
  );
$$;

grant execute on function app.module_template_visibilities(text) to authenticated;
grant execute on function app.module_template_allows_guest(text) to authenticated;
grant execute on function app.module_public_linkable(text) to authenticated;

comment on function app.module_template_visibilities(text) is
  '이 템플릿에서 고를 수 있는 공유 범위 목록. 값이 하나뿐이면 화면은 셀렉트가 아니라 읽기 전용 표시로 선다.';
comment on function app.module_public_linkable(text) is
  '이 종류가 로그인 없는 링크로 나가는 종류인가(module_templates.visibility = PUBLIC_LINK).';

-- ---------------------------------------------------------------------
-- (4) 모듈 원장 트리거 — 카탈로그 + 성격을 함께 강제한다
--     워크스페이스는 인자가 아니라 행의 entity_key가 답한다(원장이 하나로 합쳐졌다).
-- ---------------------------------------------------------------------
create or replace function app.enforce_module_template()
returns trigger
language plpgsql
set search_path = app, public
as $$
declare
  v_ws  text := app.entity_key_workspace(new.entity_key);
  v_key text := new.module_type::text;
begin
  -- 카탈로그는 **생성 시점에만** 본다. 이미 배치된 인스턴스의 수정·운영은 건드리지 않는다.
  if tg_op = 'INSERT' and not app.module_template_available(v_key, v_ws) then
    raise exception '이 템플릿은 현재 워크스페이스에서 사용할 수 없습니다: %', v_key
      using errcode = '42501';
  end if;

  -- 성격은 **값이 바뀔 때** 본다. 템플릿 성격이 나중에 바뀌어 기존 행과 어긋나더라도 그 행의
  -- 기간·담당자를 고치는 것까지 막지는 않는다 — 어긋난 행의 노출은 판정 시점(게스트 목록·
  -- 링크 게이트)이 이미 닫으므로, 여기서 또 막으면 상한이 편집까지 가로막게 된다.
  if tg_op = 'INSERT' or old.visibility is distinct from new.visibility then
    if not (new.visibility::text = any (app.module_template_visibilities(v_key))) then
      raise exception '이 템플릿에서 고를 수 없는 공유 범위입니다: % (%)', v_key, new.visibility
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function app.enforce_module_template() is
  '모듈 원장 쓰기에 템플릿 카탈로그·성격을 강제한다. 카탈로그는 생성 시점만, 공유 범위는 값이 바뀔 때만 본다.';

-- 통합 원장에 인자 없이 다시 건다. 걷힌 원장(_retired_*)의 같은 이름 트리거는 걷는다 —
-- 그 표들은 읽는 코드가 없고 삭제를 기다리는 상태이며, entity_key 컬럼이 없어 새 판정을
-- 태울 수 없다(빈 표에 규칙을 남겨 두는 것보다 규칙이 사는 곳을 하나로 두는 편이 낫다).
drop trigger if exists trg_enforce_module_template on public.program_modules;
create trigger trg_enforce_module_template
  before insert or update on public.program_modules
  for each row execute function app.enforce_module_template();

do $$
declare t text;
begin
  foreach t in array array['_retired_ma_program_modules', '_retired_project_program_modules'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_enforce_module_template on public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- (5) 인스턴스 백필 — 바깥용 종류의 인스턴스는 그 값으로 선다
--
--     3_4_15 7.1(b)(3)은 '링크가 열려 있던 모듈'만 옮기도록 적었으나, 실제 대상을 조회해
--     보니 그 규칙으로는 같은 종류의 인스턴스 7건 중 1건만 옮겨지고 나머지 6건은 담당자
--     화면에서 '고칠 수 없는데 종류와 어긋난 값'으로 남는다. **배타 구조에서 그 값은 설정이
--     아니라 종류의 되풀이**이므로, 지킬 만한 담당자의 선택이 애초에 없었다(모집의 GUEST_ONLY는
--     게스트 앱에서 안내 한 줄만 띄우는 값이었다). 실제 노출은 백필과 무관하게 성격 축이
--     판정하므로 이 update로 보이는 것이 달라지는 화면은 없다.
-- ---------------------------------------------------------------------
do $$
declare v_n integer;
begin
  update public.program_modules m
     set visibility = 'PUBLIC_LINK'
   where m.visibility <> 'PUBLIC_LINK'
     and app.module_public_linkable(m.module_type::text);
  get diagnostics v_n = row_count;
  raise notice '[공유 범위] 바깥용 종류의 인스턴스 %건을 PUBLIC_LINK로 맞췄습니다.', v_n;
end $$;

-- ---------------------------------------------------------------------
-- (6) ADMIN 저장 RPC — 상한 2종 자리에 성격 한 축을 받는다
-- ---------------------------------------------------------------------
create or replace function public.set_module_templates(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_row   jsonb;
  v_key   text;
  v_count integer := 0;
begin
  if not app.is_admin() then
    raise exception '모듈 카탈로그를 변경할 권한이 없습니다.' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception '저장할 목록이 올바르지 않습니다.';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_key := v_row->>'key';
    if not exists (select 1 from public.module_templates where key = v_key) then
      raise exception '없는 템플릿입니다: %', v_key;
    end if;
    -- 옛 화면(열어 둔 탭)이 상한 2종을 보내면 조용히 무시하지 않고 사유를 말한다 —
    -- 무시하면 담당자는 저장이 됐다고 읽고 왜 안 바뀌는지 묻게 된다.
    if v_row ? 'allow_guest' or v_row ? 'allow_public_link' then
      raise exception '공유 상한 2종은 공유 범위 한 축으로 바뀌었습니다. 화면을 새로 고친 뒤 다시 저장하세요.';
    end if;

    update public.module_templates set
      category   = coalesce(v_row->>'category', category),
      sort_order = coalesce((v_row->>'sort_order')::integer, sort_order),
      is_active  = coalesce((v_row->>'is_active')::boolean, is_active),
      workspaces = coalesce(
                     (select array_agg(value::text)
                        from jsonb_array_elements_text(v_row->'workspaces') as value),
                     case when v_row ? 'workspaces' then '{}'::text[] else workspaces end),
      visibility = coalesce(v_row->>'visibility', visibility),
      updated_at = now()
    where key = v_key;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.set_module_templates(jsonb) from public, anon;
grant execute on function public.set_module_templates(jsonb) to authenticated;

comment on function public.set_module_templates(jsonb) is
  '모듈 템플릿 배치 저장(ADMIN 전용). 분류·순서·사용 여부·워크스페이스 노출·공유 범위 성격을 한 트랜잭션에 반영한다.';
