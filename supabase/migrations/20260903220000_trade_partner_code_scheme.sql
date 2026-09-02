-- =====================================================================
-- [MANAGEMENT] 거래처 코드 체계 변경 — `YN-` + 등록순 5자리 한 줄기
--
-- 기획: docs/docs_planning/3_7_4_management_partners.md §5.2
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
--   기존 원장(20260903210000)의 컬럼·트리거만 고친다. 새 테이블·RPC·정책·버킷 없음.
--   접근 주체·RLS·감사 경로 변동 없음.
--
-- 무엇이 바뀌는가:
--   접두어를 담당자가 고르던 것(영문 2글자, 접두어마다 번호가 따로 돌던 구조)을 걷고,
--   회사가 쓰는 접두어 하나(`YN-`)와 등록순 한 줄기로 고정한다.
--
-- 왜:
--   접두어를 고를 수 있다는 것은 곧 번호 줄기가 여러 개라는 뜻이고, 그러면 "몇 번째로 등록한
--   거래처인가"에 원장이 답하지 못한다. 실제로 가를 일이 없는 축(회사는 하나다)에 선택지를
--   두면, 담당자마다 다른 두 글자를 적어 같은 성격의 거래처가 서로 다른 줄기로 갈린다.
--   고를 것이 없으면 고르게 하지 않는다 — 코드는 이제 전적으로 서버가 붙인다.
--
--   하이픈을 넣는 것은 코드가 두 조각(회사 표시 + 번호)임을 눈으로 가르기 위해서다.
--
-- 기존 행:
--   원장은 어제 만들어졌고 발급된 코드가 아직 어느 전표에도 실리지 않았다. 남아 있는 행이
--   있다면 코드는 새 체계로 다시 계산된다(코드 불변 원칙은 발급 이후를 지키는 규칙이며,
--   체계 자체를 바꿀 수 있는 시점은 지금이 마지막이다).
-- =====================================================================

-- 1) 코드 열 재정의 -----------------------------------------------------------
-- 생성 열의 식은 나중에 고칠 수 없다(PostgreSQL). 지우고 다시 만든다 — 컬럼을 지우면
-- 그 위의 유니크 인덱스도 함께 걷히므로 아래에서 다시 세운다.
alter table public.trade_partners drop column if exists code;

alter table public.trade_partners drop constraint if exists trade_partners_code_prefix_chk;
alter table public.trade_partners drop column if exists code_prefix;

alter table public.trade_partners
  add column if not exists code text
  generated always as ('YN-' || lpad(code_seq::text, 5, '0')) stored;

comment on column public.trade_partners.code is
  '표시용 거래처 코드(YN- + 등록순 5자리). 생성 열이라 직접 쓰지 않으며 발급 후 바뀌지 않는다.';

-- 코드는 원장 전체에서 유일하다. 중단·삭제 행도 번호를 계속 점유한다 — 한 번 쓴 번호를
-- 다시 내주면 옛 전표가 가리키는 거래처가 어느 날 다른 회사가 된다.
create unique index if not exists trade_partners_code_uniq
  on public.trade_partners (code);

-- 2) 채번 트리거 --------------------------------------------------------------
-- 줄기가 하나가 되었으므로 잠금도 하나다. 다음 번호를 세는 동안 다른 트랜잭션을 막지 않으면
-- 두 사람이 같은 순간에 등록할 때 같은 번호를 읽어 한쪽이 유니크 위반으로 튕긴다.
create or replace function app.stamp_trade_partner_insert()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('trade_partner_code'));

  select coalesce(max(p.code_seq), 0) + 1
    into NEW.code_seq
    from public.trade_partners p;

  if NEW.code_seq > 99999 then
    raise exception '거래처 코드가 모두 소진되었습니다(99999).' using errcode = '23514';
  end if;

  if NEW.created_by is null then
    NEW.created_by := app.current_app_user_id();
  end if;
  return NEW;
end;
$$;

-- 3) 코드 고정 트리거 ---------------------------------------------------------
-- 발급된 번호는 바뀌지 않는다. 화면은 애초에 보내지 않으므로 여기 걸리는 것은 화면 밖
-- 경로뿐이고, 그때는 무엇이 거부됐는지 드러나야 한다(말없이 되돌리지 않는다).
create or replace function app.freeze_trade_partner_code()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if NEW.code_seq is distinct from OLD.code_seq then
    raise exception '거래처 코드는 변경할 수 없습니다.' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
