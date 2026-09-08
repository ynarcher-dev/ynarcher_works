-- =====================================================================
-- [M&A 퀵리뷰 모듈 3/3] 퀵 리뷰의 작성일·작성자 + 연결 해제 시 모듈 회수
-- 정본: docs/docs_planning/3_6_1_ma_seller_quick_review.md
-- 선행: 20260908230000(종류) · 20260908240000(자동 생성)
--
-- 2026-09-09 사용자 지정 둘:
--   (1) "퀵리뷰는 일정은 퀵리뷰가 작성된 작성일, 담당은 퀵리뷰를 생성한 생성자를 넣어줘."
--   (2) "배치가 되면 퀵리뷰가 자동 생성, 빠지면 퀵리뷰도 같이 빠지는 구조."
--
-- ── (1) 작성일·작성자를 원장이 갖는다 ────────────────────────────────────────
-- 모듈 카드의 기간·담당자 칸은 지금까지 비어 있었다("일정 미등록 / 담당 미지정"). 이 모듈은
-- 담당자가 만든 배치물이 아니라 **원장을 비추는 거울**이라(20260908240000) 담당자가 채울 값이
-- 아니었고, 그렇다고 비워 두면 카드가 아무것도 말하지 않는다. 그래서 값을 모듈에 적어 넣는
-- 대신 **원장이 답하게** 한다 — 화면은 이 두 칸을 읽어 기간·담당자 자리에 세운다.
--
-- 칸을 새로 파는 이유는 `updated_at`이 이 물음에 답하지 못하기 때문이다. 그 칸은 연락처 한
-- 줄을 고쳐도 움직이므로 "퀵 리뷰를 언제 썼는가"와 다른 값이고, 행위자를 남기지도 않는다
-- (`entity_contributions`는 행위자를 남기지만 **어느 칸을 고쳤는지**는 답하지 않는다).
--
-- 갱신은 트리거가 한다 — 저장 경로가 화면 폼 하나가 아니고(앞으로 RPC·임포터가 늘 수 있다),
-- 값을 적는 자리를 경로마다 두면 한 곳만 빠뜨린 날 그 저장은 작성 사실을 남기지 않는다.
-- 퀵 리뷰를 **지우면 작성 사실도 함께 지운다** — 없는 문서의 작성일이 남아 있으면 카드가
-- 없는 사실을 말한다.
--
-- ── (2) 연결이 비면 모듈도 함께 걷는다 ──────────────────────────────────────
-- 20260908240000은 이 비대칭을 의도로 두었다("잘못 눌러 연결을 비운 순간 모듈에 달아 둔
-- 기간·담당자·메모가 함께 사라지면 되돌릴 방법이 없다"). 그 근거가 (1)로 사라진다 — 기간과
-- 담당자는 이제 모듈이 들고 있는 값이 아니라 원장에서 읽는 값이고, 연결이 0건인 모듈은
-- 비출 것이 없는 빈 거울이다. 워크플로우 줄에 남은 빈 칸은 그 자리에 무엇이 있는지 묻는
-- 사람에게 "아무것도 없다"고 답하는 대신 "여기 뭔가 있다"고 말한다.
--
-- **다만 담긴 것이 있으면 걷지 않는다.** 자동 삭제는 사람이 따라쓰기까지 하고 지우는
-- `delete_program_module`과 달리 아무도 확인하지 않으므로, 무엇 하나라도 이 모듈에 매달려
-- 있으면(글·폼·링크·공지·첨부) 그대로 두고 사람이 지우게 한다. 판정은 삭제창이 쓰는
-- `program_module_delete_blockers`를 그대로 부른다 — 같은 물음에 두 벌의 답을 만들지 않는다.
-- 퀵리뷰 모듈은 자기 원장이 없어(값은 M&A 원장이 소유한다) 정상 경로에서는 언제나 0건이다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: mna / 데이터 등급: Internal(작성 시각과 작성자 uuid — 개인정보 칸이
--     아니며 ma_sellers의 기존 마스킹 정책 'mna.sellers' 대상도 아니다).
--   - 접근 주체: 무변경. 새 컬럼은 기존 ma_sellers 정책의 적용을 그대로 받는다(게스트는 mna
--     권한이 없어 그대로 막힌다). 새 테이블·RLS 정책·DELETE 정책 없음.
--   - Scope 기준: 무변경.
--   - 신규 SECURITY DEFINER: 없음. 트리거 함수 `app.touch_ma_seller_quick_review()`는 INVOKER다
--     (`app.set_updated_at`과 같은 자리·같은 등급) — 하는 일이 자기 행의 두 칸을 채우는 것뿐이고,
--     행위자를 묻는 `app.current_app_user_id()`가 이미 DEFINER라 이 함수까지 올릴 이유가 없다.
--     search_path는 고정한다.
--   - 재정의 RPC: `set_ma_program_party_links`(인가·검증 본문 무변경, 끝의 회수 블록만 추가).
--     인가는 종전대로 첫머리의 can_write_workspace('mna') + can_access_ws_program('mna', id)이며,
--     **모듈을 지울 수 있는 사람은 매물 연결을 고칠 수 있는 사람과 같은 집합**이다.
--   - 감사 로그: 자동 삭제도 audit_logs('MODULE_DELETE')를 남긴다 — 되돌릴 수 없는 삭제라
--     누가 무엇을 없앴는지 남지 않으면 다음날 그 모듈을 찾는 사람에게 답할 근거가 없다.
--   - 운영 영향: 이미 연결된 프로젝트에는 소급 생성을 두지 않는다(20260908240000의 판단 그대로).
--     지금 연결 1건·모듈 1건으로 짝이 맞아 메울 자리도 없다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 퀵 리뷰의 작성일·작성자
-- ---------------------------------------------------------------------
alter table public.ma_sellers
  add column if not exists quick_review_written_at timestamptz,
  add column if not exists quick_review_written_by uuid references public.users(id);

comment on column public.ma_sellers.quick_review_written_at is
  '퀵 리뷰를 마지막으로 저장한 시각(트리거가 채운다). updated_at과 다른 값이다 — 그쪽은 연락처 한 줄만 고쳐도 움직인다. 퀵리뷰 모듈 카드의 기간 칸이 이 값을 읽는다.';
comment on column public.ma_sellers.quick_review_written_by is
  '퀵 리뷰를 마지막으로 저장한 사람(트리거가 채운다). 퀵리뷰 모듈 카드의 담당 칸이 이 값을 읽는다 — 모듈 담당자 원장에는 행을 만들지 않는다(그 원장은 사업 담당자 풀 소속만 받고, 이 값은 배정이 아니라 사실이다).';

create or replace function app.touch_ma_seller_quick_review()
returns trigger
language plpgsql
set search_path = app, public
as $$
begin
  -- 퀵 리뷰가 바뀌지 않은 저장(연락처·희망사항 수정)은 작성 사실을 건드리지 않는다.
  if tg_op = 'UPDATE' and new.quick_review is not distinct from old.quick_review then
    return new;
  end if;

  if new.quick_review is null then
    -- 지우면 작성 사실도 없다. 남겨 두면 없는 문서의 작성일이 카드에 선다.
    new.quick_review_written_at := null;
    new.quick_review_written_by := null;
  else
    new.quick_review_written_at := now();
    -- 행위자를 모르는 경로(service_role)에서는 비워 둔다 — 지어내지 않는다.
    new.quick_review_written_by := app.current_app_user_id();
  end if;
  return new;
end;
$$;

comment on function app.touch_ma_seller_quick_review() is
  'ma_sellers.quick_review가 실제로 바뀐 저장에만 작성일·작성자를 새로 적는다. 다른 칸만 고친 저장은 지나가고, 퀵 리뷰를 지우면 작성 사실도 함께 비운다.';

drop trigger if exists trg_ma_sellers_quick_review_written on public.ma_sellers;
create trigger trg_ma_sellers_quick_review_written
  before insert or update on public.ma_sellers
  for each row execute function app.touch_ma_seller_quick_review();

-- 옛 행 채우기. 값의 출처는 두 사실이다 — 시각은 그 행의 마지막 수정 시각, 사람은 그때의
-- 행위자(기여 로그). 그 저장이 퀵 리뷰만 고친 것인지는 로그가 답하지 않으므로 근사값이지만,
-- 지금 있는 3행은 모두 퀵 리뷰를 쓰기 위해 만들어졌고 기여 로그의 행위자도 한 사람이다.
-- 로그가 없는 행은 사람 칸을 비운 채 둔다(생성자로 대신 채우면 없는 사실을 적게 된다).
--
-- **트리거를 내리고 UPDATE한다.** 켜 둔 채로 돌리면 기여 로그가 행위자 없는 'edited'를 전 행에
-- 쌓고 updated_at이 오늘로 밀려 화면이 "오늘 누군가 고쳤다"는 거짓을 말한다 — 스키마 이동은
-- 업무 행위가 아니다(20260906140000과 같은 규칙). 새로 단 트리거도 함께 내려가므로 아래
-- UPDATE가 적는 값이 그대로 남는다.
alter table public.ma_sellers disable trigger user;

update public.ma_sellers s
   set quick_review_written_at = s.updated_at,
       quick_review_written_by = (
         select c.user_id
           from public.entity_contributions c
          where c.entity_table = 'ma_sellers'
            and c.entity_id = s.id
          order by c.created_at desc
          limit 1
       )
 where s.quick_review is not null
   and s.quick_review_written_at is null;

alter table public.ma_sellers enable trigger user;

-- ---------------------------------------------------------------------
-- (2) 연결 해제 시 퀵리뷰 모듈 회수
--     본문은 20260908240000에서 그대로 떠 왔고 마지막 블록만 바뀐다.
-- ---------------------------------------------------------------------
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
  v_module_id uuid;
  v_left text;
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
  -- 상태는 DRAFT(준비)다. 기간·담당자는 여기서 적지 않는다 — 그 두 칸은 이제 원장이
  -- 답한다(퀵 리뷰의 작성일·작성자). 모듈에 값을 적어 두면 원장을 고쳤을 때 어느 쪽이
  -- 진짜인지 판정할 근거가 없다.
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

  -- 연결이 0건이면 모듈도 함께 걷는다(2026-09-09 사용자 지정 "빠지면 퀵리뷰도 같이 빠지는
  -- 구조"). 비출 것이 없는 거울을 워크플로우에 세워 두면 그 줄이 없는 일을 있다고 말한다.
  --
  -- **담긴 것이 있으면 두고 나간다.** 자동 삭제에는 따라쓰기 확인도 PM 판정도 없으므로,
  -- 무엇 하나라도 이 모듈에 매달려 있으면(글·폼·링크·공지·첨부) 사람이 지우게 한다.
  -- 판정은 삭제창이 쓰는 함수를 그대로 부른다 — 같은 물음에 두 벌의 답을 만들지 않는다.
  else
    select m.id into v_module_id
      from public.program_modules m
     where m.program_id = p_program_id
       and m.entity_key = 'ma_program'
       and m.module_type = 'QUICK_REVIEW';

    if v_module_id is not null then
      select string_agg(b.rel_name || ' ' || b.row_count || '건', ', ')
        into v_left
        from public.program_module_delete_blockers('ma_program', v_module_id) b;

      if v_left is null then
        -- 되돌릴 수 없는 삭제다. 자동이라도(오히려 자동이라서) 누가 무엇을 없앴는지 남긴다.
        insert into public.audit_logs (actor_user_id, action, changed_workspace, before_data, reason)
        values (
          app.current_app_user_id(), 'MODULE_DELETE', 'mna',
          jsonb_build_object('entity_key', 'ma_program', 'module_id', v_module_id,
                             'program_id', p_program_id, 'module_type', 'QUICK_REVIEW'),
          '매물 연결 해제로 퀵리뷰 모듈 자동 삭제'
        );
        -- 담당자 배정은 cascade라 본체 삭제가 함께 지운다. 그 밖에 매달린 것은 위에서
        -- 0건임을 확인했다.
        delete from public.program_modules where id = v_module_id;
      end if;
    end if;
  end if;
end;
$$;

comment on function public.set_ma_program_party_links(uuid, uuid[], uuid[]) is
  'M&A 프로젝트의 매물 연결 전량 교체. 연결이 생기면 퀵리뷰 모듈이 하나 서고, 연결이 0건이 되면 그 모듈을 함께 걷는다(매달린 데이터가 있으면 두고 나가며 그때는 사람이 삭제한다).';
