-- ma_sellers·ma_buyers 식별 게이트의 거절 문구만 바꾼다 — 로직·권한·주석은 그대로다.
--
-- 화면이 이 예외 문구를 그대로 토스트에 옮기므로(`MaPartyForm` → `ledgerSaveFailureText`),
-- 사이드바 이름이 `데이터베이스 > 스타트업`으로 바뀐 뒤에는 `스타트업 DB를 연결하세요`가
-- 화면에 없는 자리를 가리킨다. 2026-09-13에 works 전체에서 이 원장을 부르는 말을
-- `스타트업 원장`으로 통일했고, 서버가 말하는 문구도 같은 말을 쓴다.
--
-- `create or replace`라 ACL(`proacl`)과 `comment`는 유지되며, 트리거 두 개는 같은 함수를
-- 계속 가리킨다(재생성·재부착 없음).

create or replace function app.ma_party_identity_gate()
returns trigger
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_norm     text;
  v_hit      uuid;
  v_hit_name text;
  v_live     boolean;
  v_changed  boolean;
begin
  v_norm := app.format_biz_reg_no(new.biz_reg_no);
  if v_norm is not null
     and (tg_op = 'INSERT' or v_norm is distinct from app.format_biz_reg_no(old.biz_reg_no)) then
    if not app.is_valid_biz_reg_no(v_norm) then
      raise exception '사업자등록번호 형식이 맞지 않습니다: %', new.biz_reg_no
        using errcode = '22023', hint = 'biz_reg_no_invalid';
    end if;
  end if;
  -- 연결된 행은 번호를 갖지 않는다 — 스타트업 원장이 정본이다.
  new.biz_reg_no := case when new.startup_id is not null then null else v_norm end;

  v_live := new.deleted_at is null and new.merged_into_id is null;
  v_changed := tg_op = 'INSERT'
    or new.name          is distinct from old.name
    or new.contact_email is distinct from old.contact_email
    or new.phone         is distinct from old.phone
    or new.biz_reg_no    is distinct from old.biz_reg_no
    or new.startup_id    is distinct from old.startup_id
    or (old.deleted_at is not null and new.deleted_at is null)
    or (old.merged_into_id is not null and new.merged_into_id is null);

  if v_live and v_changed and new.startup_id is null then
    v_hit := app.find_startup_identity(new.biz_reg_no, new.name, new.contact_email, new.phone, null, false, false);
    if v_hit is not null then
      select s.name into v_hit_name from public.startups s where s.id = v_hit;
      raise exception '스타트업 원장에 있는 기업입니다 — %. 새로 만들지 말고 스타트업 원장을 연결하세요.', v_hit_name
        using errcode = '23505', hint = 'startup_link_required:' || v_hit;
    end if;
  end if;
  return new;
end;
$$;
