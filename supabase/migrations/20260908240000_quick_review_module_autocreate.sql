-- =====================================================================
-- [M&A 퀵리뷰 모듈 2/2] 매물을 연결하면 퀵리뷰 모듈이 선다
-- 정본: docs/docs_planning/3_6_1_ma_seller_quick_review.md
--
-- 앞 파일(20260908230000)이 더한 종류를 여기서 쓴다. 파일을 가른 이유는 `alter type ...
-- add value`로 더한 값을 **같은 트랜잭션 안에서 쓸 수 없기** 때문이다.
--
-- 만드는 자리를 이 RPC로 둔 이유는 연결을 바꾸는 길이 이 함수 하나이기 때문이다. 화면에서
-- 만들면 다른 경로로 연결된 프로젝트에는 모듈이 서지 않고, 그 사실을 알려 주는 것이 없다.
--
-- **비대칭이 하나 있고 그것은 의도다** — 연결이 생기면 모듈이 서지만, 연결이 0건이 되어도
-- 지우지 않는다. 모듈 인스턴스를 지우는 일은 그 사업의 PM만 따라쓰기 확인을 거쳐 하는
-- 되돌릴 수 없는 작업이고(3_4_2 §6.2), 매물 목록을 고치는 것은 그 작업을 시킬 만한 행위가
-- 아니다. 잘못 눌러 연결을 비운 순간 모듈에 달아 둔 기간·담당자·메모가 함께 사라지면
-- 되돌릴 방법이 없다. 연결이 비면 모듈은 그대로 서서 "연결된 매물이 없습니다"라고 답한다.
--
-- **함수 본문은 20260907200000에서 그대로 떠 왔고 끝의 한 블록만 더한다.** 손으로 옮겨
-- 적지 않은 이유는 본문이 80줄이고 그 대부분이 사업구분별 검증이기 때문이다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: mna
--   - 데이터 등급: Internal (모듈 인스턴스 한 행 — 내용은 원장이 갖는다)
--   - 접근 주체: 무변경 — 함수 첫머리의 판정(app.can_write_workspace('mna') +
--     app.can_access_ws_program('mna', program_id))이 그대로다. 즉 **매물을 연결할 수 있는
--     사람만** 이 모듈을 세운다.
--   - Scope 기준: 무변경.
--   - 신규 테이블·정책 없음. 신규 RPC 없음(기존 함수 재정의).
--   - 신규 인덱스 1종(부분 유일 — 프로젝트당 퀵리뷰 하나). OUTCOMES 싱글턴과 같은 형태이며,
--     앞 파일이 아니라 여기 있는 이유는 조건절이 새 enum 값을 **쓰기** 때문이다(55P04).
--   - SECURITY DEFINER 신설: 없음. 종전대로 DEFINER이며 그 근거도 그대로다 —
--     ma_program_party_links를 원자적으로 전량 교체해야 하고 판정은 첫머리에서 자체로 한다.
--     DEFINER라 program_modules의 RLS를 지나가지만, 그 인가는 이미 위에서 끝났다.
--   - 감사 로그: 없음(모듈 생성은 종전에도 감사 대상이 아니다 — 삭제만 audit_logs를 남긴다).
--   - 운영 영향: 이미 매물이 연결된 프로젝트에는 **소급 적용되지 않는다.** 다음번 매물
--     연결을 저장할 때 선다. 소급 삽입을 두지 않는 이유는 그 프로젝트들의 워크플로우에
--     담당자가 만들지 않은 칸이 어느 날 갑자기 나타나기 때문이다.
-- =====================================================================

-- 프로젝트당 하나. 이 모듈이 세우는 것은 '연결된 매물 전부'라 둘일 이유가 없고, 둘이면
-- 어느 쪽이 이 프로젝트의 검토인지 화면이 답하지 못한다. 아래 RPC의 `not exists` 가드가
-- 정상 경로를 막고, 이 인덱스는 그 가드를 지나온 동시 실행 둘을 막는다.
create unique index if not exists uq_program_modules_quick_review_singleton
  on public.program_modules (program_id)
  where module_type = 'QUICK_REVIEW';

create or replace function public.set_ma_program_party_links(
  p_program_id uuid,
  p_buyer_ids uuid[] default '{}'::uuid[],
  p_seller_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app
as $$
declare
  v_category text;
  v_buyer_ids uuid[];
  v_seller_ids uuid[];
begin
  if not app.can_write_workspace('mna')
     or not app.can_access_ws_program('mna', p_program_id) then
    raise exception 'M&A 프로젝트 매물 연결 권한이 없습니다.' using errcode = '42501';
  end if;

  select category
    into v_category
    from public.ma_programs
   where id = p_program_id;

  if not found then
    raise exception 'M&A 프로젝트를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
    into v_buyer_ids
    from unnest(coalesce(p_buyer_ids, '{}'::uuid[])) as x
   where x is not null;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
    into v_seller_ids
    from unnest(coalesce(p_seller_ids, '{}'::uuid[])) as x
   where x is not null;

  if v_category = 'SELL' and cardinality(v_buyer_ids) > 0 then
    raise exception 'Sell 프로젝트에는 M&A SELLER 매물만 연결할 수 있습니다.' using errcode = '23514';
  elsif v_category = 'BUY' and cardinality(v_seller_ids) > 0 then
    raise exception 'Buy 프로젝트에는 M&A BUYER 매물만 연결할 수 있습니다.' using errcode = '23514';
  elsif v_category not in ('SELL', 'BUY', 'SELL_BUY')
        and (cardinality(v_buyer_ids) > 0 or cardinality(v_seller_ids) > 0) then
    raise exception 'Sell, Buy 또는 Sell+Buy 프로젝트만 매물을 연결할 수 있습니다.' using errcode = '23514';
  end if;

  if exists (
    select 1
      from unnest(v_seller_ids) id
     where not exists (
       select 1 from public.ma_sellers s where s.id = id and s.deleted_at is null
     )
  ) then
    raise exception '연결할 수 없는 M&A SELLER 매물이 포함되어 있습니다.' using errcode = '23503';
  end if;

  if exists (
    select 1
      from unnest(v_buyer_ids) id
     where not exists (
       select 1 from public.ma_buyers b where b.id = id and b.deleted_at is null
     )
  ) then
    raise exception '연결할 수 없는 M&A BUYER 매물이 포함되어 있습니다.' using errcode = '23503';
  end if;

  delete from public.ma_program_party_links where program_id = p_program_id;

  if v_category in ('SELL', 'SELL_BUY') then
    insert into public.ma_program_party_links (program_id, seller_id)
    select p_program_id, id from unnest(v_seller_ids) id;
  end if;
  if v_category in ('BUY', 'SELL_BUY') then
    insert into public.ma_program_party_links (program_id, buyer_id)
    select p_program_id, id from unnest(v_buyer_ids) id;
  end if;

  -- 연결이 하나라도 있으면 퀵리뷰 모듈이 하나 선다(2026-09-08 사용자 지정 "연동하면 탭이
  -- 생기는 게 아니라 모듈을 하나 생성하자").
  --
  -- **여기서 만드는 이유**는 연결을 바꾸는 길이 이 함수 하나이기 때문이다. 화면에서 만들면
  -- 다른 경로로 연결된 프로젝트에는 모듈이 서지 않고, 그 사실을 알려 주는 것이 없다.
  --
  -- **title을 비운다.** uq_program_modules_title이 프로젝트 안에서 모듈명을 유일하게 잡고
  -- 있어, '퀵리뷰'를 박아 넣으면 담당자가 이미 그 이름의 글쓰기 모듈을 만들어 둔
  -- 프로젝트에서 **매물 연결 자체가 실패한다.** 이름이 비면 화면이 템플릿 라벨로 폴백한다.
  --
  -- 상태는 DRAFT(준비)다. 기간·담당자는 비워 둔다 — 아직 정하지 않은 값이고(사용자 지정
  -- "날짜랑 담당은 아직 잘 모르겠네"), 지어내면 화면이 없는 사실을 말한다. 담당자가 모듈
  -- 설정에서 채우는 길은 다른 모듈과 똑같이 열려 있다.
  if cardinality(v_seller_ids) > 0 or cardinality(v_buyer_ids) > 0 then
    insert into public.program_modules (program_id, entity_key, module_type, visibility, status)
    select p_program_id, 'ma_program', 'QUICK_REVIEW'::public.module_type,
           'INTERNAL_ONLY'::public.module_visibility, 'DRAFT'::public.module_status
     where not exists (
       select 1
         from public.program_modules m
        where m.program_id = p_program_id
          and m.entity_key = 'ma_program'
          and m.module_type = 'QUICK_REVIEW'
     );
  end if;

  -- **연결이 0건이 되어도 지우지 않는다.** 모듈 인스턴스를 지우는 일은 그 사업의 PM만
  -- 따라쓰기 확인을 거쳐 하는 되돌릴 수 없는 작업이고(delete_program_module), 매물 목록을
  -- 고치는 것은 그 작업을 시킬 만한 행위가 아니다. 잘못 눌러 연결을 비운 순간 담당자가
  -- 모듈에 달아 둔 기간·담당자·메모가 함께 사라지면, 되돌릴 방법이 없다.
  -- 연결이 비면 모듈은 그대로 서서 "연결된 매물이 없습니다"라고 답한다.
end;
$$;
