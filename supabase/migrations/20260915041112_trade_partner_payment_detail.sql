-- =====================================================================
-- 고른 거래처 **한 건**의 지급 정보 — 계좌번호 전체가 나오는 유일한 경로.
--
-- 왜 필요한가
--   송금 요청서는 "지금 원장에 무엇이 적혀 있는가"를 묻는 화면이 아니라 **결재를 받은 지시**다.
--   결재자가 승인한 계좌와 경영지원이 실제로 이체한 계좌가 같아야 하므로, 요청 줄은 고르는
--   순간의 계좌를 문서에 적어 둔다(사본). 그 사본을 채우려면 계좌번호 전체가 한 번 필요하다.
--
-- 왜 목록을 열지 않는가
--   가르는 축은 사람이 아니라 **범위**다. 원장을 훑는 일(검색·목록)에는 계좌 전체가 필요 없고,
--   지금까지처럼 가려진 뷰(public.trade_partners_directory, 뒤 4자리)가 답한다. 계좌 전체가
--   필요한 일은 "고른 그 한 건의 요청 줄을 채우는 것" 하나뿐이므로, 여는 문도 그 모양이다 —
--   **id 하나를 받아 한 행만 돌려준다.** 검색어도, 목록도, 페이지도 받지 않는다.
--
-- 노출 범위의 변화(명시)
--   원장 테이블(public.trade_partners)의 SELECT는 지금까지도, 지금도 `management` 읽기 권한자
--   뿐이다. 이 함수는 그 경계를 **한 칸 넓힌다** — 내부 임직원이면 누구나, 자기가 지목한 거래처
--   한 건의 계좌 전체를 볼 수 있다. 넓히는 이유는 지출결의서를 쓰는 사람이 경영지원만이 아니기
--   때문이고, 넓히는 폭을 한 건으로 묶은 것이 이 설계의 전부다. 등록번호(법인 사업자번호 ·
--   개인 생년월일)와 증빙 서류는 **여기서도 나오지 않는다** — 송금에 쓰이지 않는 값이다.
--
-- 감사
--   계좌 전체 조회는 남긴다(public.access_logs). 개인 거래처의 계좌는 개인정보이고, 게이트
--   문서(docs/docs_dev/11_migration_security_gate.md §3)가 원본 조회에 적재 경로를 요구한다.
--   적재는 함수 안에서 일어나므로 화면이 건너뛸 수 없다.
--
-- 보안 게이트 점검
--   · 소유: MANAGEMENT 원장 / OFFICE 사용, 데이터 등급: Restricted(계좌), 범위: global(내부).
--   · 새 테이블·뷰·정책·트리거 없음. SECURITY DEFINER 함수 1개 추가.
--   · search_path 고정(`app, public`), 함수 내부에서 인증·내부 사용자 판정을 **먼저** 수행.
--   · GRANT는 `authenticated` 하나. public·anon·service_role에서 REVOKE.
--   · 원장 RLS 경계 불변(정책을 고치지 않는다). 가려진 뷰의 노출 범위도 그대로다.
--   · 감사 적재: `access_logs`(resource_type = 'trade_partner_payment').
-- =====================================================================

create or replace function public.trade_partner_payment_detail(p_partner_id uuid)
returns table (
  id             uuid,
  code           text,
  name           text,
  partner_type   text,
  bank_code      text,
  account_no     text,
  account_holder text,
  is_active      boolean,
  verified_at    timestamptz
)
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_uid uuid := app.current_app_user_id();
  r     record;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  -- 내부 임직원만. 게스트는 결재를 쓰지 않으므로 여기에 닿을 이유가 없다
  -- (register_trade_partner_quick과 같은 문장을 쓴다 — 두 문이 갈리면 한쪽만 고쳐진다).
  if not app.is_internal_user() then
    raise exception 'internal users only' using errcode = '42501';
  end if;
  if p_partner_id is null then
    return;
  end if;

  -- 정리된 행(deleted_at)은 내지 않는다. 거래가 끝난 행(is_active = false)은 **낸다** —
  -- 옛 요청서가 가리키는 거래처는 중단된 뒤에도 자기 계좌를 답해야 한다(그 사실은 함께 낸다).
  select p.id, p.code, p.name, p.partner_type, p.bank_code,
         p.account_no, p.account_holder, p.is_active, p.verified_at
    into r
    from public.trade_partners p
   where p.id = p_partner_id
     and p.deleted_at is null;

  -- 없는 id는 오류가 아니라 **빈 결과**다. 있고 없고를 오류로 가르면 이 함수가 원장에 무엇이
  -- 있는지 물어보는 도구가 된다(id를 넣어 보며 존재를 세는 일).
  if not found then
    return;
  end if;

  insert into public.access_logs (user_id, resource_type, resource_id, reason)
  values (v_uid, 'trade_partner_payment', r.id, '송금 요청 계좌 사본');

  id             := r.id;
  code           := r.code;
  name           := r.name;
  partner_type   := r.partner_type;
  bank_code      := r.bank_code;
  account_no     := r.account_no;
  account_holder := r.account_holder;
  is_active      := r.is_active;
  verified_at    := r.verified_at;
  return next;
end;
$$;

comment on function public.trade_partner_payment_detail(uuid) is
  '고른 거래처 한 건의 지급 정보(코드·상호·구분·은행·계좌번호 전체·예금주·거래 여부·확인 여부). '
  '계좌번호 전체가 나오는 유일한 경로이며, 송금 요청 한 줄에 그때의 계좌 사본을 적기 위해서만 '
  '쓴다. 목록·검색은 지금까지대로 가려진 뷰(trade_partners_directory, 뒤 4자리)가 답한다. '
  'id 하나를 받아 한 행만 내고, 없는 id는 빈 결과다. 내부 임직원만 실행할 수 있으며 조회는 '
  'access_logs(resource_type = ''trade_partner_payment'')에 남는다. 등록번호·증빙 서류는 내지 않는다.';

revoke all on function public.trade_partner_payment_detail(uuid) from public, anon, service_role;
grant execute on function public.trade_partner_payment_detail(uuid) to authenticated;
